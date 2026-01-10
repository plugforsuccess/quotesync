-- Migration 013: Lead Scoring & Pipeline Dashboard Support
-- Adds lead scoring, first contact tracking, and attribution fields

-- =============================================================================
-- ADD SCORING FIELDS TO LEADS
-- =============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_factors JSONB DEFAULT '[]';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_updated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;

-- Attribution fields (if not already present from other migrations)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_intent TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS session_id TEXT;

-- =============================================================================
-- INDEXES FOR DASHBOARD QUERIES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_first_contact ON leads(first_contact_at);
CREATE INDEX IF NOT EXISTS idx_leads_agency_score ON leads(agency_id, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_agency_created ON leads(agency_id, created_at DESC);

-- Composite index for dashboard default sort (highest score, oldest uncontacted)
CREATE INDEX IF NOT EXISTS idx_leads_dashboard_sort ON leads(agency_id, lead_score DESC, created_at ASC);

-- =============================================================================
-- AUDIT LOG EVENT TYPES EXPANSION (safe to re-run)
-- =============================================================================

-- Note: audit_log.event_type is TEXT, so no enum changes needed
-- New event types: LEAD_STATUS_UPDATED, LEAD_FIRST_CONTACT_SET

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN leads.lead_score IS 'Computed lead quality score 0-100';
COMMENT ON COLUMN leads.score_factors IS 'Array of factors contributing to score';
COMMENT ON COLUMN leads.score_updated_at IS 'Timestamp when score was last computed';
COMMENT ON COLUMN leads.first_contact_at IS 'Timestamp of first agent contact with lead';
