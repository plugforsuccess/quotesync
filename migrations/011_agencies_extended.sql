-- Migration: 011_agencies_extended.sql
-- Purpose: Additional multi-tenant tables + backfill existing stories
-- Non-breaking: App behavior unchanged

-- =============================================================================
-- ADDITIONAL ENUM TYPES
-- =============================================================================

CREATE TYPE enrichment_status AS ENUM ('pending', 'enriched', 'failed');
CREATE TYPE exclusivity_level AS ENUM ('none', 'zip_exclusive', 'city_exclusive');

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
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE lead_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- LEAD_QUOTES POLICIES
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view agency lead_quotes"
    ON lead_quotes FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can create agency lead_quotes"
    ON lead_quotes FOR INSERT
    TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can update agency lead_quotes"
    ON lead_quotes FOR UPDATE
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()))
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners and managers can delete lead_quotes"
    ON lead_quotes FOR DELETE
    TO authenticated
    USING (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- -----------------------------------------------------------------------------
-- ROUTING_RULES POLICIES
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view agency routing_rules"
    ON routing_rules FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Owners can create routing_rules"
    ON routing_rules FOR INSERT
    TO authenticated
    WITH CHECK (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

CREATE POLICY "Owners can update routing_rules"
    ON routing_rules FOR UPDATE
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

CREATE POLICY "Owners can delete routing_rules"
    ON routing_rules FOR DELETE
    TO authenticated
    USING (
        agency_id IN (
            SELECT agency_id FROM agency_users
            WHERE user_id = auth.uid() AND role = 'owner'
        )
    );

-- -----------------------------------------------------------------------------
-- AUDIT_LOG POLICIES
-- -----------------------------------------------------------------------------

CREATE POLICY "Users can view agency audit_log"
    ON audit_log FOR SELECT
    TO authenticated
    USING (agency_id IN (SELECT get_user_agency_ids()));

CREATE POLICY "Users can create audit_log entries"
    ON audit_log FOR INSERT
    TO authenticated
    WITH CHECK (agency_id IN (SELECT get_user_agency_ids()));

-- Audit logs are immutable - no UPDATE or DELETE for authenticated users

-- =============================================================================
-- BACKFILL EXISTING DATA
-- =============================================================================

-- Backfill stories with default agency
UPDATE stories
SET agency_id = '00000000-0000-0000-0000-000000000001'
WHERE agency_id IS NULL;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE lead_quotes IS 'Quote data associated with leads';
COMMENT ON TABLE routing_rules IS 'Agency-specific lead routing configuration';
COMMENT ON TABLE audit_log IS 'Immutable audit trail for agency actions';
