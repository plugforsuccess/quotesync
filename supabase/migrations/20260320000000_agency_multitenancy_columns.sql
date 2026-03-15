-- ============================================================================
-- MT-01: Agency Multi-Tenancy Columns
-- Adds per-agency branding, Twilio config, territory, and onboarding columns.
-- twilio_from_number and agent_cell_number were added in 20260315300000 —
-- this migration adds the remaining multi-tenancy fields.
-- ============================================================================

-- Per-agency branding for SMS/UI
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS agent_first_name   TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS site_url           TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS canopy_slug        TEXT;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS slug               TEXT;

-- Territory config
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS licensed_states    TEXT[]  DEFAULT '{}';
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS target_zip_ranges  JSONB   DEFAULT '[]';

-- Onboarding status
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS setup_completed_at TIMESTAMPTZ;
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS setup_steps        JSONB DEFAULT '{}';

-- Unique constraint on slug for funnel parameterization (MT-08)
CREATE UNIQUE INDEX IF NOT EXISTS agencies_slug_unique ON agencies (slug) WHERE slug IS NOT NULL;

-- Seed existing Wiley-Wilson agency
UPDATE agencies SET
  agent_first_name   = 'Cam',
  site_url           = 'https://insuredbycam.com',
  canopy_slug        = 'insuredbycam',
  slug               = 'insuredbycam',
  licensed_states    = ARRAY['GA'],
  setup_completed_at = now(),
  setup_steps        = '{"profile":true,"twilio":true,"territory":true,"commission":true,"team":true}'::jsonb
WHERE id = '00000000-0000-0000-0000-000000000001';

COMMENT ON COLUMN agencies.agent_first_name IS 'Agent first name for personalized SMS/UI (e.g. "Cam")';
COMMENT ON COLUMN agencies.site_url IS 'Agency website URL (e.g. "https://insuredbycam.com")';
COMMENT ON COLUMN agencies.canopy_slug IS 'Canopy Connect slug (e.g. "insuredbycam" in app.usecanopy.com/c/insuredbycam)';
COMMENT ON COLUMN agencies.slug IS 'URL-safe slug for funnel parameterization (e.g. /save?agency=insuredbycam)';
COMMENT ON COLUMN agencies.licensed_states IS 'Array of 2-letter state codes the agency is licensed in';
COMMENT ON COLUMN agencies.target_zip_ranges IS 'JSON array of ZIP prefix objects: [{"prefix":"303","state":"GA"}]';
COMMENT ON COLUMN agencies.setup_completed_at IS 'Timestamp when agency completed onboarding setup';
COMMENT ON COLUMN agencies.setup_steps IS 'JSON object tracking onboarding step completion';
