-- ============================================================================
-- EXIT-READY PLATFORM: DATA MODEL CHANGES
-- ============================================================================
-- Purpose: Transform single-tenant platform into multi-agency SaaS
-- Timeline: Phase 1 (Months 1-3)
-- Risk Level: Medium (additive changes, backward compatible)
-- ============================================================================

-- ============================================================================
-- 1. AGENCIES TABLE (Core Tenant Entity)
-- ============================================================================

CREATE TABLE agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Business Identity
  name TEXT NOT NULL,
  legal_name TEXT NOT NULL,
  doing_business_as TEXT,

  -- Licensing & Compliance
  state_licenses TEXT[] NOT NULL,              -- ['GA', 'FL', 'TN']
  npn_number TEXT,                             -- National Producer Number
  primary_state TEXT NOT NULL,

  -- Service Areas
  service_zip_codes TEXT[],                    -- Or use PostGIS for territory mapping
  excluded_zip_codes TEXT[],

  -- Branding (White-Label)
  brand_name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#0066cc',
  secondary_color TEXT DEFAULT '#14b8a6',

  -- Contact & Social
  email TEXT NOT NULL,
  phone TEXT,
  address JSONB,                               -- {street, city, state, zip}
  social_links JSONB,                          -- {instagram, facebook, linkedin}

  -- Integration Settings
  canopy_url TEXT,                             -- Agency-specific Canopy link
  stripe_account_id TEXT,                      -- Stripe Connect for payouts
  crm_webhook_url TEXT,

  -- Platform Settings
  features_enabled JSONB DEFAULT '{
    "newsroom": true,
    "store": true,
    "courses": false,
    "referrals": false
  }'::jsonb,
  subscription_tier TEXT DEFAULT 'starter',    -- 'starter', 'professional', 'enterprise'
  subscription_status TEXT DEFAULT 'active',   -- 'active', 'suspended', 'canceled'

  -- Compliance
  terms_accepted_at TIMESTAMPTZ,
  compliance_reviewed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_subscription_tier CHECK (subscription_tier IN ('starter', 'professional', 'enterprise')),
  CONSTRAINT valid_subscription_status CHECK (subscription_status IN ('active', 'suspended', 'canceled'))
);

-- Indexes
CREATE INDEX idx_agencies_primary_state ON agencies(primary_state);
CREATE INDEX idx_agencies_subscription_status ON agencies(subscription_status);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_agencies_updated_at BEFORE UPDATE ON agencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. AGENTS TABLE (Users within Agencies)
-- ============================================================================

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  agency_id UUID REFERENCES agencies NOT NULL,

  -- Agent Identity
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  -- Licensing
  agent_license_number TEXT,
  licensed_states TEXT[],

  -- Territory Assignment
  assigned_zip_codes TEXT[],                   -- Subset of agency service area

  -- Role & Permissions
  role TEXT NOT NULL DEFAULT 'agent',          -- 'owner', 'agent', 'editor', 'viewer'
  permissions JSONB DEFAULT '{}'::jsonb,

  -- Status
  status TEXT DEFAULT 'active',                -- 'active', 'inactive', 'suspended'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, agency_id),
  CONSTRAINT valid_agent_role CHECK (role IN ('owner', 'agent', 'editor', 'viewer')),
  CONSTRAINT valid_agent_status CHECK (status IN ('active', 'inactive', 'suspended'))
);

-- Indexes
CREATE INDEX idx_agents_agency_id ON agents(agency_id);
CREATE INDEX idx_agents_user_id ON agents(user_id);
CREATE INDEX idx_agents_status ON agents(status);

CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON agents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. QUOTES TABLE (Critical Missing Piece)
-- ============================================================================

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies NOT NULL,
  assigned_agent_id UUID REFERENCES agents,

  -- Customer Data
  customer_email TEXT,
  customer_phone TEXT,
  customer_name TEXT,
  customer_address JSONB,

  -- Quote Details
  zip_code TEXT NOT NULL,
  current_carrier TEXT,
  policy_type TEXT,                            -- 'auto', 'home', 'bundle'
  canopy_quote_id TEXT,                        -- External reference

  -- Attribution
  referral_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  landing_page TEXT,
  referrer TEXT,

  -- Journey Tracking
  source TEXT,                                 -- 'newsroom', 'direct', 'store', 'referral'
  session_id TEXT,

  -- Status & Lifecycle
  status TEXT DEFAULT 'new',                   -- 'new', 'contacted', 'quoted', 'sold', 'lost'
  contacted_at TIMESTAMPTZ,
  quoted_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  lost_reason TEXT,

  -- Revenue Tracking
  quoted_premium DECIMAL(10,2),
  sold_premium DECIMAL(10,2),
  commission_amount DECIMAL(10,2),

  -- Metadata
  canopy_data JSONB,                           -- Full webhook payload
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_quote_status CHECK (status IN ('new', 'contacted', 'quoted', 'sold', 'lost')),
  CONSTRAINT valid_policy_type CHECK (policy_type IN ('auto', 'home', 'bundle', 'life', 'other'))
);

-- Indexes
CREATE INDEX idx_quotes_agency_id ON quotes(agency_id);
CREATE INDEX idx_quotes_status ON quotes(status);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_assigned_agent_id ON quotes(assigned_agent_id);
CREATE INDEX idx_quotes_session_id ON quotes(session_id);
CREATE INDEX idx_quotes_referral_code ON quotes(referral_code);
CREATE INDEX idx_quotes_utm_source ON quotes(utm_source);

CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. REFERRAL_CODES TABLE (Compliance-Safe)
-- ============================================================================

CREATE TABLE referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies NOT NULL,

  -- Code Identity
  code TEXT NOT NULL UNIQUE,                   -- 'FRIEND2024', 'JOHN-ATL'
  code_type TEXT NOT NULL,                     -- 'agent', 'partner', 'customer'

  -- Owner
  owner_agent_id UUID REFERENCES agents,
  owner_name TEXT,
  owner_email TEXT,

  -- Reward Structure (Non-Monetary for Compliance)
  reward_type TEXT,                            -- 'priority_service', 'extended_review', 'education_access'
  reward_description TEXT,

  -- Limits & Controls
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,

  -- Status
  status TEXT DEFAULT 'active',                -- 'active', 'paused', 'expired'

  -- Audit Trail
  approved_by UUID REFERENCES agents,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_referral_code_type CHECK (code_type IN ('agent', 'partner', 'customer')),
  CONSTRAINT valid_referral_status CHECK (status IN ('active', 'paused', 'expired'))
);

-- Indexes
CREATE INDEX idx_referral_codes_agency_id ON referral_codes(agency_id);
CREATE INDEX idx_referral_codes_code ON referral_codes(code);
CREATE INDEX idx_referral_codes_status ON referral_codes(status);

CREATE TRIGGER update_referral_codes_updated_at BEFORE UPDATE ON referral_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. PRODUCTS TABLE (Move from Hardcoded)
-- ============================================================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies,          -- NULL = platform-wide

  -- Product Identity
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  long_description TEXT,

  -- Product Type
  type TEXT NOT NULL,                          -- 'pdf', 'video', 'course', 'physical'
  category TEXT,                               -- 'guide', 'checklist', 'playbook'

  -- Pricing
  price_cents INTEGER DEFAULT 0,               -- 0 = free
  original_price_cents INTEGER,
  currency TEXT DEFAULT 'USD',

  -- Digital Asset
  file_url TEXT,                               -- S3/Cloudflare URL
  file_size_bytes INTEGER,

  -- Visibility
  status TEXT DEFAULT 'draft',                 -- 'draft', 'published', 'archived'
  is_featured BOOLEAN DEFAULT FALSE,
  is_bestseller BOOLEAN DEFAULT FALSE,

  -- SEO
  meta_title TEXT,
  meta_description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(agency_id, slug),
  CONSTRAINT valid_product_type CHECK (type IN ('pdf', 'video', 'course', 'physical')),
  CONSTRAINT valid_product_status CHECK (status IN ('draft', 'published', 'archived'))
);

-- Indexes
CREATE INDEX idx_products_agency_id ON products(agency_id);
CREATE INDEX idx_products_slug ON products(slug);
CREATE INDEX idx_products_status ON products(status);

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. ORDERS TABLE (Store Revenue Tracking)
-- ============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES agencies NOT NULL,
  product_id UUID REFERENCES products NOT NULL,

  -- Customer
  customer_email TEXT NOT NULL,
  customer_name TEXT,

  -- Payment
  stripe_payment_intent_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'pending',               -- 'pending', 'completed', 'failed', 'refunded'

  -- Fulfillment
  download_url TEXT,
  download_expires_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ,

  -- Attribution
  referral_code TEXT,
  session_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_order_status CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
);

-- Indexes
CREATE INDEX idx_orders_agency_id ON orders(agency_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. USER_JOURNEYS TABLE (Next Best Action Foundation)
-- ============================================================================

CREATE TABLE user_journeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  agency_id UUID REFERENCES agencies,

  -- User Context
  customer_email TEXT,
  zip_code TEXT,

  -- Journey Events
  events JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{timestamp, type, page, action}]
  first_page TEXT,
  last_page TEXT,
  pages_viewed INTEGER DEFAULT 1,

  -- Engagement Scoring
  engagement_score INTEGER,                    -- 0-100
  intent_signal TEXT,                          -- 'quote', 'education', 'comparison'

  -- Conversion
  converted_to_quote BOOLEAN DEFAULT FALSE,
  quote_id UUID REFERENCES quotes,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_intent_signal CHECK (intent_signal IN ('quote', 'education', 'comparison', 'browsing'))
);

-- Indexes
CREATE INDEX idx_user_journeys_session_id ON user_journeys(session_id);
CREATE INDEX idx_user_journeys_agency_id ON user_journeys(agency_id);
CREATE INDEX idx_user_journeys_converted ON user_journeys(converted_to_quote);

CREATE TRIGGER update_user_journeys_updated_at BEFORE UPDATE ON user_journeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. BACKFILL EXISTING DATA (Default Agency)
-- ============================================================================

-- Create default agency for existing InsuredByCam operations
INSERT INTO agencies (
  id,
  name,
  legal_name,
  brand_name,
  primary_state,
  state_licenses,
  email,
  phone,
  canopy_url,
  features_enabled,
  subscription_tier,
  subscription_status
) VALUES (
  'default-agency-id',
  'InsuredByCam',
  'Cameron Insurance Services LLC',
  'Cameron',
  'GA',
  ARRAY['GA'],
  'cameron@insuredbycam.com',
  NULL,  -- TODO: Add phone if available
  'https://app.usecanopy.com/c/insuredbycam',
  '{"newsroom": true, "store": true, "courses": false, "referrals": false}'::jsonb,
  'professional',
  'active'
);

-- Add agency_id to existing stories table
ALTER TABLE stories ADD COLUMN agency_id UUID REFERENCES agencies DEFAULT 'default-agency-id';

-- Future: Make agency_id NOT NULL after all data migrated
-- ALTER TABLE stories ALTER COLUMN agency_id SET NOT NULL;
-- ALTER TABLE stories ALTER COLUMN agency_id DROP DEFAULT;

-- ============================================================================
-- 9. ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_journeys ENABLE ROW LEVEL SECURITY;

-- Quotes: Agents can only view their agency's quotes
CREATE POLICY "Agents can view agency quotes"
  ON quotes FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- Quotes: Agents can insert quotes for their agency
CREATE POLICY "Agents can create agency quotes"
  ON quotes FOR INSERT
  WITH CHECK (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- Quotes: Agents can update their agency's quotes
CREATE POLICY "Agents can update agency quotes"
  ON quotes FOR UPDATE
  USING (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- Products: Anyone can view published platform-wide products
CREATE POLICY "Published platform products are public"
  ON products FOR SELECT
  USING (status = 'published' AND agency_id IS NULL);

-- Products: Agents can view their agency's products
CREATE POLICY "Agents can view agency products"
  ON products FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- Referral Codes: Agents can view their agency's codes
CREATE POLICY "Agents can view agency referral codes"
  ON referral_codes FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- Orders: Agents can view their agency's orders
CREATE POLICY "Agents can view agency orders"
  ON orders FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM agents WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. HELPER FUNCTIONS
-- ============================================================================

-- Function to find servicing agency by ZIP code
CREATE OR REPLACE FUNCTION find_agency_by_zip(zip TEXT)
RETURNS TABLE (
  agency_id UUID,
  agency_name TEXT,
  canopy_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.name,
    a.canopy_url
  FROM agencies a
  WHERE a.subscription_status = 'active'
    AND (
      zip = ANY(a.service_zip_codes)
      OR (
        a.service_zip_codes IS NULL
        AND EXISTS (
          -- Fallback: Check if ZIP's state matches agency licenses
          SELECT 1
          -- TODO: Implement ZIP to state mapping
        )
      )
    )
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. ANALYTICS VIEWS (For Diligence Reporting)
-- ============================================================================

-- Quote funnel performance by agency
CREATE OR REPLACE VIEW quote_funnel_metrics AS
SELECT
  a.name AS agency_name,
  DATE_TRUNC('month', q.created_at) AS month,
  COUNT(*) AS total_quotes,
  COUNT(*) FILTER (WHERE q.status = 'sold') AS sold_count,
  ROUND(COUNT(*) FILTER (WHERE q.status = 'sold')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS conversion_rate,
  AVG(q.sold_premium) FILTER (WHERE q.status = 'sold') AS avg_premium,
  SUM(q.commission_amount) AS total_commission,
  AVG(EXTRACT(EPOCH FROM (q.sold_at - q.created_at)) / 86400) FILTER (WHERE q.status = 'sold') AS avg_days_to_close
FROM quotes q
JOIN agencies a ON a.id = q.agency_id
GROUP BY a.id, a.name, DATE_TRUNC('month', q.created_at)
ORDER BY month DESC, agency_name;

-- Lead source attribution
CREATE OR REPLACE VIEW quote_source_attribution AS
SELECT
  a.name AS agency_name,
  COALESCE(q.utm_source, 'direct') AS source,
  COUNT(*) AS quotes,
  COUNT(*) FILTER (WHERE q.status = 'sold') AS sold,
  ROUND(COUNT(*) FILTER (WHERE q.status = 'sold')::NUMERIC / NULLIF(COUNT(*), 0) * 100, 2) AS conversion_rate,
  SUM(q.commission_amount) AS revenue
FROM quotes q
JOIN agencies a ON a.id = q.agency_id
GROUP BY a.id, a.name, COALESCE(q.utm_source, 'direct')
ORDER BY revenue DESC NULLS LAST;

-- ============================================================================
-- ROLLBACK SCRIPT (Emergency Use Only)
-- ============================================================================

/*
-- Drop all new tables in reverse dependency order
DROP VIEW IF EXISTS quote_source_attribution;
DROP VIEW IF EXISTS quote_funnel_metrics;
DROP FUNCTION IF EXISTS find_agency_by_zip(TEXT);
DROP TABLE IF EXISTS user_journeys;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS referral_codes;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS agencies CASCADE;

-- Remove agency_id from stories
ALTER TABLE stories DROP COLUMN IF EXISTS agency_id;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_updated_at_column();
*/

-- ============================================================================
-- END OF DATA MODEL CHANGES
-- ============================================================================
