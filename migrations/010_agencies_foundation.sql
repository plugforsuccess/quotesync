-- Migration: 010_agencies_foundation.sql
-- Purpose: Foundational multi-tenant schema with hard tenant isolation
-- Scope: agencies, agency_users, leads tables + RLS policies + default agency backfill
-- Non-breaking: No changes to existing app behavior

-- =============================================================================
-- ENUM TYPES
-- =============================================================================

CREATE TYPE agency_status AS ENUM ('pending', 'approved', 'suspended');
CREATE TYPE agency_role AS ENUM ('owner', 'manager', 'agent');
CREATE TYPE lead_status AS ENUM ('new', 'assigned', 'contacted', 'quoted', 'advanced', 'inactive', 'unknown');

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

-- Index for status filtering
CREATE INDEX idx_agencies_status ON agencies(status);

-- =============================================================================
-- AGENCY_USERS TABLE (Join table: users <-> agencies)
-- =============================================================================

CREATE TABLE agency_users (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    role agency_role NOT NULL DEFAULT 'agent',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, agency_id)
);

-- Indexes for common lookups
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

-- Indexes for leads
CREATE INDEX idx_leads_agency_id ON leads(agency_id);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_agency_status ON leads(agency_id, status);
CREATE INDEX idx_leads_updated_at ON leads(updated_at DESC);

-- Trigger for updated_at
CREATE TRIGGER set_leads_updated_at
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- HELPER FUNCTION: Get user's agency IDs
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

-- Enable RLS on all tables
ALTER TABLE agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- AGENCIES POLICIES
-- -----------------------------------------------------------------------------

-- Users can view agencies they belong to
CREATE POLICY "Users can view own agencies"
    ON agencies FOR SELECT
    TO authenticated
    USING (id IN (SELECT get_user_agency_ids()));

-- Only agency owners can update their agency
CREATE POLICY "Owners can update own agency"
    ON agencies FOR UPDATE
    TO authenticated
    USING (
        id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    )
    WITH CHECK (
        id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- -----------------------------------------------------------------------------
-- AGENCY_USERS POLICIES
-- -----------------------------------------------------------------------------

-- Users can view members of their agencies
CREATE POLICY "Users can view agency members"
    ON agency_users FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

-- Owners and managers can add members to their agencies
CREATE POLICY "Owners and managers can add members"
    ON agency_users FOR INSERT
    TO authenticated
    WITH CHECK (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- Owners can update member roles
CREATE POLICY "Owners can update member roles"
    ON agency_users FOR UPDATE
    TO authenticated
    USING (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    )
    WITH CHECK (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- Owners and managers can remove members (except owners)
CREATE POLICY "Owners and managers can remove members"
    ON agency_users FOR DELETE
    TO authenticated
    USING (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
        AND role != 'owner'  -- Cannot delete owners
    );

-- -----------------------------------------------------------------------------
-- LEADS POLICIES
-- -----------------------------------------------------------------------------

-- Users can view leads from their agencies
CREATE POLICY "Users can view agency leads"
    ON leads FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

-- Users can create leads for their agencies
CREATE POLICY "Users can create agency leads"
    ON leads FOR INSERT
    TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

-- Users can update leads from their agencies
CREATE POLICY "Users can update agency leads"
    ON leads FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

-- Owners and managers can delete leads
CREATE POLICY "Owners and managers can delete leads"
    ON leads FOR DELETE
    TO authenticated
    USING (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- =============================================================================
-- DEFAULT AGENCY BACKFILL
-- =============================================================================

-- Create default agency for existing data
INSERT INTO agencies (id, name, brand_name, email, status, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'InsuredByCam',
    'insuredbycam',
    'admin@insuredbycam.com',
    'approved',
    now()
);

-- Link all existing auth users to default agency as agents
-- (This ensures existing users can still access the system)
INSERT INTO agency_users (user_id, agency_id, role, created_at)
SELECT
    id,
    '00000000-0000-0000-0000-000000000001',
    'agent',
    now()
FROM auth.users
ON CONFLICT (user_id, agency_id) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE agencies IS 'Multi-tenant agency accounts';
COMMENT ON TABLE agency_users IS 'User membership in agencies with roles';
COMMENT ON TABLE leads IS 'Leads owned by agencies';
COMMENT ON FUNCTION get_user_agency_ids() IS 'Returns all agency IDs the current user belongs to';
