-- Migration: 010_agencies_foundation.sql
-- Purpose: Foundational multi-tenant schema with hard tenant isolation
-- Non-breaking: No changes to existing app behavior

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE agency_status AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE agency_role AS ENUM ('owner', 'manager', 'agent');
CREATE TYPE lead_status AS ENUM ('new', 'assigned', 'contacted', 'quoted', 'advanced', 'inactive', 'unknown');
CREATE TYPE enrichment_status AS ENUM ('pending', 'enriched', 'failed');
CREATE TYPE exclusivity_level AS ENUM ('none', 'zip_exclusive', 'city_exclusive');

-- =============================================================================
-- AGENCIES TABLE
-- =============================================================================

CREATE TABLE agencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand_name TEXT,
    email TEXT,
    status agency_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agencies_status ON agencies(status);

-- =============================================================================
-- AGENCY_USERS TABLE
-- =============================================================================

CREATE TABLE agency_users (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    role agency_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, agency_id)
);

CREATE INDEX idx_agency_users_user_id ON agency_users(user_id);
CREATE INDEX idx_agency_users_agency_id ON agency_users(agency_id);

-- =============================================================================
-- LEADS TABLE
-- =============================================================================

CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    pull_id TEXT UNIQUE,
    state TEXT,
    zip TEXT,
    status lead_status NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_agency_id ON leads(agency_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_agency_status ON leads(agency_id, status);
CREATE INDEX idx_leads_updated_at ON leads(updated_at DESC);

CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- LEAD_QUOTES TABLE
-- =============================================================================

CREATE TABLE lead_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    quote_summary JSONB,
    enrichment_status enrichment_status NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_quotes_lead_id ON lead_quotes(lead_id);
CREATE INDEX idx_lead_quotes_agency_id ON lead_quotes(agency_id);
CREATE INDEX idx_lead_quotes_enrichment_status ON lead_quotes(enrichment_status);

-- =============================================================================
-- ROUTING_RULES TABLE
-- =============================================================================

CREATE TABLE routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    state TEXT,
    zip TEXT,
    exclusivity_level exclusivity_level NOT NULL DEFAULT 'none',
    priority_tier INTEGER NOT NULL DEFAULT 0,
    capacity_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_routing_rules_agency_id ON routing_rules(agency_id);
CREATE INDEX idx_routing_rules_state_zip ON routing_rules(state, zip);
CREATE INDEX idx_routing_rules_priority ON routing_rules(priority_tier DESC);

-- =============================================================================
-- AUDIT_LOG TABLE
-- =============================================================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_agency_id ON audit_log(agency_id);
CREATE INDEX idx_audit_log_lead_id ON audit_log(lead_id);
CREATE INDEX idx_audit_log_event_type ON audit_log(event_type);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);

-- =============================================================================
-- ADD agency_id TO EXISTING STORIES TABLE
-- =============================================================================

ALTER TABLE stories
    ADD COLUMN agency_id UUID REFERENCES agencies(id) ON DELETE SET NULL;

CREATE INDEX idx_stories_agency_id ON stories(agency_id);

-- =============================================================================
-- HELPER FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_agency_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT agency_id FROM agency_users WHERE user_id = auth.uid();
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- AGENCIES POLICIES
CREATE POLICY "Users can view own agencies"
    ON agencies FOR SELECT TO authenticated
    USING (id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners can update own agency"
    ON agencies FOR UPDATE TO authenticated
    USING (id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'))
    WITH CHECK (id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'));

-- AGENCY_USERS POLICIES
CREATE POLICY "Users can view agency members"
    ON agency_users FOR SELECT TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners and managers can add members"
    ON agency_users FOR INSERT TO authenticated
    WITH CHECK (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')));

CREATE POLICY "Owners can update member roles"
    ON agency_users FOR UPDATE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'))
    WITH CHECK (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "Owners and managers can remove members"
    ON agency_users FOR DELETE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')) AND role != 'owner');

-- LEADS POLICIES
CREATE POLICY "Users can view agency leads"
    ON leads FOR SELECT TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can create agency leads"
    ON leads FOR INSERT TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can update agency leads"
    ON leads FOR UPDATE TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners and managers can delete leads"
    ON leads FOR DELETE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')));

-- LEAD_QUOTES POLICIES
CREATE POLICY "Users can view agency lead_quotes"
    ON lead_quotes FOR SELECT TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can create agency lead_quotes"
    ON lead_quotes FOR INSERT TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can update agency lead_quotes"
    ON lead_quotes FOR UPDATE TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners and managers can delete lead_quotes"
    ON lead_quotes FOR DELETE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role IN ('owner', 'manager')));

-- ROUTING_RULES POLICIES
CREATE POLICY "Users can view agency routing_rules"
    ON routing_rules FOR SELECT TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners can create routing_rules"
    ON routing_rules FOR INSERT TO authenticated
    WITH CHECK (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "Owners can update routing_rules"
    ON routing_rules FOR UPDATE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'))
    WITH CHECK (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'));

CREATE POLICY "Owners can delete routing_rules"
    ON routing_rules FOR DELETE TO authenticated
    USING (agency_id IN (SELECT agency_id FROM agency_users WHERE user_id = auth.uid() AND role = 'owner'));

-- AUDIT_LOG POLICIES
CREATE POLICY "Users can view agency audit_log"
    ON audit_log FOR SELECT TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can create audit_log entries"
    ON audit_log FOR INSERT TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

-- =============================================================================
-- DEFAULT AGENCY BACKFILL
-- =============================================================================

INSERT INTO agencies (id, name, brand_name, email, status, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'InsuredByCam',
    'insuredbycam',
    'admin@insuredbycam.com',
    'approved',
    now()
);

INSERT INTO agency_users (user_id, agency_id, role, created_at)
SELECT id, '00000000-0000-0000-0000-000000000001', 'agent', now()
FROM auth.users
ON CONFLICT (user_id, agency_id) DO NOTHING;

UPDATE stories
SET agency_id = '00000000-0000-0000-0000-000000000001'
WHERE agency_id IS NULL;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE agencies IS 'Multi-tenant agency accounts';
COMMENT ON TABLE agency_users IS 'User membership in agencies with roles';
COMMENT ON TABLE leads IS 'Leads owned by agencies';
COMMENT ON TABLE lead_quotes IS 'Quote data associated with leads';
COMMENT ON TABLE routing_rules IS 'Agency-specific lead routing configuration';
COMMENT ON TABLE audit_log IS 'Immutable audit trail for agency actions';
