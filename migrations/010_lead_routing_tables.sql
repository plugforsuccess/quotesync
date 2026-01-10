-- Migration 010: Lead Creation & Routing Tables
-- Creates tables for lead capture, agency management, routing rules, and audit logging

-- ============================================================================
-- AGENCIES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Only one agency should be default (insuredbycam)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for default agency lookup
CREATE INDEX idx_agencies_default ON agencies(is_default) WHERE is_default = true;

-- Insert default agency (insuredbycam)
INSERT INTO agencies (name, slug, email, is_default)
VALUES ('Insured by Cam', 'insuredbycam', 'leads@insuredbycam.com', true)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- AGENCY_USERS TABLE (links auth.users to agencies)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agency_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'agent')),
  receives_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, agency_id)
);

CREATE INDEX idx_agency_users_agency ON agency_users(agency_id);
CREATE INDEX idx_agency_users_user ON agency_users(user_id);

-- ============================================================================
-- ROUTING_RULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  state TEXT NOT NULL, -- 2-letter state code
  zip_prefix TEXT, -- NULL = entire state, otherwise prefix match (e.g., '303' for 303xx)
  exclusivity_level TEXT DEFAULT 'none' CHECK (exclusivity_level IN ('none', 'zip', 'state')),
  priority_tier INTEGER DEFAULT 1, -- Higher = more priority
  capacity_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_routing_rules_state ON routing_rules(state);
CREATE INDEX idx_routing_rules_agency ON routing_rules(agency_id);
CREATE INDEX idx_routing_rules_priority ON routing_rules(priority_tier DESC);

-- ============================================================================
-- LEADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pull_id TEXT UNIQUE NOT NULL, -- Canopy pull ID
  agency_id UUID NOT NULL REFERENCES agencies(id),
  assigned_to_user_id UUID REFERENCES auth.users(id),

  -- Contact/Location
  state TEXT NOT NULL,
  zip TEXT NOT NULL,

  -- Product intent
  product_intent TEXT,

  -- Attribution
  session_id TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  referral_code TEXT,
  landing_page TEXT,

  -- Routing metadata
  routing_rule_id UUID REFERENCES routing_rules(id),
  routed_via_fallback BOOLEAN DEFAULT false,

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'closed_won', 'closed_lost')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_leads_agency ON leads(agency_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_created ON leads(created_at DESC);
CREATE INDEX idx_leads_pull_id ON leads(pull_id);

-- ============================================================================
-- AUDIT_LOG TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK',
    'STATUS_CHANGED', 'ASSIGNED'
  )),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_audit_log_lead ON audit_log(lead_id);
CREATE INDEX idx_audit_log_event ON audit_log(event_type);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);

-- ============================================================================
-- NOTIFICATIONS TABLE (in-app notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Agencies: readable by their users
CREATE POLICY "Agency users can view their agency"
  ON agencies FOR SELECT
  USING (
    id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid())
    OR is_default = true
  );

-- Agency users: can view own memberships
CREATE POLICY "Users can view their agency memberships"
  ON agency_users FOR SELECT
  USING (user_id = auth.uid());

-- Routing rules: agency owners/managers can manage
CREATE POLICY "Agency managers can view routing rules"
  ON routing_rules FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM agency_users
      WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- Leads: ONLY visible to assigned agency (privacy-first)
CREATE POLICY "Agency users can view their leads"
  ON leads FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid())
  );

CREATE POLICY "Agency users can update their leads"
  ON leads FOR UPDATE
  USING (
    agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid())
  );

-- Audit log: agency users can view their agency's logs
CREATE POLICY "Agency users can view their audit logs"
  ON audit_log FOR SELECT
  USING (
    agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid())
  );

-- Notifications: users see only their own
CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================================
-- SERVICE ROLE POLICIES (for Edge Functions)
-- ============================================================================

-- Allow service role to insert leads
CREATE POLICY "Service role can insert leads"
  ON leads FOR INSERT
  WITH CHECK (true);

-- Allow service role to insert audit logs
CREATE POLICY "Service role can insert audit logs"
  ON audit_log FOR INSERT
  WITH CHECK (true);

-- Allow service role to insert notifications
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);
