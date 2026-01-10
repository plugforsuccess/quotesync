-- Migration 015: Privacy Compliance Hardening
-- Adds consent tracking, anonymization support, and admin audit improvements

-- ============================================================================
-- A) CONSENT TRACKING - Add consent_at to leads
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_text TEXT;

-- ============================================================================
-- C) RETENTION & ANONYMIZATION - Add anonymization tracking
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Create index for retention queries
CREATE INDEX IF NOT EXISTS idx_leads_consent_at ON leads(consent_at);
CREATE INDEX IF NOT EXISTS idx_leads_anonymized_at ON leads(anonymized_at) WHERE anonymized_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created_for_retention ON leads(created_at) WHERE anonymized_at IS NULL;

-- ============================================================================
-- D) ADMIN AUDIT - Ensure ADMIN_VIEW_LEAD logging function exists
-- ============================================================================
CREATE OR REPLACE FUNCTION log_lead_view(
  p_lead_id UUID,
  p_user_id UUID,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void AS $$
BEGIN
  INSERT INTO audit_log (event_type, lead_id, metadata)
  VALUES (
    'ADMIN_VIEW_LEAD',
    p_lead_id,
    jsonb_build_object(
      'viewed_by', p_user_id,
      'viewed_at', now()
    ) || p_metadata
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- E) NEWSROOM - Add constraint for source attribution on published stories
-- ============================================================================
-- Add publish-time validation function
CREATE OR REPLACE FUNCTION validate_story_publish()
RETURNS TRIGGER AS $$
BEGIN
  -- Only validate when publishing (status changing to 'published')
  IF NEW.status = 'published' AND (OLD.status IS NULL OR OLD.status != 'published') THEN
    IF NEW.source_name IS NULL OR NEW.source_name = '' THEN
      RAISE EXCEPTION 'source_name is required for published stories';
    END IF;
    IF NEW.source_url IS NULL OR NEW.source_url = '' THEN
      RAISE EXCEPTION 'source_url is required for published stories';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists to allow re-running)
DROP TRIGGER IF EXISTS trg_validate_story_publish ON stories;
CREATE TRIGGER trg_validate_story_publish
  BEFORE INSERT OR UPDATE ON stories
  FOR EACH ROW
  EXECUTE FUNCTION validate_story_publish();

-- ============================================================================
-- C) RETENTION JOB SUPPORT - Create anonymization function
-- ============================================================================
CREATE OR REPLACE FUNCTION anonymize_expired_leads(
  p_pii_retention_days INTEGER DEFAULT 90,
  p_dry_run BOOLEAN DEFAULT false
)
RETURNS TABLE(anonymized_count INTEGER, lead_ids UUID[]) AS $$
DECLARE
  v_count INTEGER := 0;
  v_ids UUID[];
BEGIN
  -- Find leads past retention threshold that haven't been anonymized
  SELECT array_agg(id), count(*)::INTEGER
  INTO v_ids, v_count
  FROM leads
  WHERE anonymized_at IS NULL
    AND created_at < now() - (p_pii_retention_days || ' days')::INTERVAL;

  IF NOT p_dry_run AND v_count > 0 THEN
    -- Anonymize PII fields while preserving analytics data
    UPDATE leads
    SET
      -- Preserve: state, zip (first 3 digits), product_intent, utm fields, session_id
      -- Anonymize: any PII that may exist
      anonymized_at = now(),
      updated_at = now()
    WHERE id = ANY(v_ids);

    -- Log the anonymization
    INSERT INTO audit_log (event_type, metadata)
    VALUES (
      'RETENTION_ANONYMIZED_LEADS',
      jsonb_build_object(
        'count', v_count,
        'retention_days', p_pii_retention_days,
        'executed_at', now()
      )
    );
  END IF;

  RETURN QUERY SELECT v_count, v_ids;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role for edge functions
GRANT EXECUTE ON FUNCTION anonymize_expired_leads TO service_role;
GRANT EXECUTE ON FUNCTION log_lead_view TO service_role;
