-- Migration 012: Canopy Webhook Enrichment Support
-- Adds enrichment job queue and additional fields for webhook processing

-- =============================================================================
-- ENRICHMENT JOBS TABLE (async job queue)
-- =============================================================================

CREATE TABLE IF NOT EXISTS enrichment_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    pull_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- POLICIES_AVAILABLE, COMPLETE, etc.
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_enrichment_jobs_status ON enrichment_jobs(status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_enrichment_jobs_lead ON enrichment_jobs(lead_id);
CREATE INDEX idx_enrichment_jobs_pull ON enrichment_jobs(pull_id);

-- =============================================================================
-- ADD ENRICHMENT FIELDS TO lead_quotes
-- =============================================================================

ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS has_documents BOOLEAN DEFAULT false;
ALTER TABLE lead_quotes ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- Unique constraint: one quote row per lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_quotes_lead_unique ON lead_quotes(lead_id);

-- =============================================================================
-- ADD ENRICHMENT STATUS TO leads (optional mirror)
-- =============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'enriched', 'failed'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON leads(enrichment_status);

-- =============================================================================
-- WEBHOOK SECRETS TABLE (for storing Canopy webhook secret)
-- =============================================================================

CREATE TABLE IF NOT EXISTS webhook_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL UNIQUE, -- 'canopy'
    secret_hash TEXT NOT NULL, -- bcrypt hash of the secret
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- ROW LEVEL SECURITY FOR NEW TABLES
-- =============================================================================

ALTER TABLE enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_secrets ENABLE ROW LEVEL SECURITY;

-- Service role only access for enrichment_jobs
CREATE POLICY "Service role can manage enrichment_jobs"
    ON enrichment_jobs FOR ALL
    USING (true)
    WITH CHECK (true);

-- Service role only access for webhook_secrets
CREATE POLICY "Service role can manage webhook_secrets"
    ON webhook_secrets FOR ALL
    USING (true)
    WITH CHECK (true);

-- Service role can upsert lead_quotes (for enrichment worker)
DROP POLICY IF EXISTS "Service role can upsert lead_quotes" ON lead_quotes;
CREATE POLICY "Service role can upsert lead_quotes"
    ON lead_quotes FOR ALL
    USING (true)
    WITH CHECK (true);

-- Service role can update leads enrichment status
DROP POLICY IF EXISTS "Service role can update leads" ON leads;
CREATE POLICY "Service role can update leads"
    ON leads FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE enrichment_jobs IS 'Async job queue for Canopy pull enrichment';
COMMENT ON TABLE webhook_secrets IS 'Webhook authentication secrets by provider';
COMMENT ON COLUMN lead_quotes.has_documents IS 'Whether documents are available from Canopy';
COMMENT ON COLUMN lead_quotes.enriched_at IS 'Timestamp when enrichment completed';
COMMENT ON COLUMN leads.enrichment_status IS 'Mirror of lead_quotes enrichment status';
COMMENT ON COLUMN leads.quote_updated_at IS 'Last time quote data was updated';
