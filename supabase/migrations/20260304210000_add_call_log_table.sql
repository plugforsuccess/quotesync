-- Migration: Add rc_call_log table for individual call records from RingCentral Call Log exports.
-- This becomes the primary data source for CS performance metrics.
--
-- Dedup strategy:
--   Composite key: (org_id, employee_user_id, call_start_time, call_direction, call_result)
--   This is the most reliable composite because RingCentral exports don't guarantee a stable
--   provider-side call ID in CSV exports (Session Id is XLSX-only). The same agent cannot have
--   two calls in the same direction with the same result starting at the exact same second.
--   Re-uploads with ignoreDuplicates safely skip existing rows.
--
-- PII policy:
--   from_number / to_number contain phone numbers (PII-at-rest).
--   - Stored unencrypted for operational matching (admin-only access via RLS).
--   - Masked to last-4 in all UI rendering (***-***-1234).
--   - Retention: 180 days. Records older than retention_expires_at are eligible for purge.
--   - A scheduled job should periodically DELETE WHERE retention_expires_at < now().
--
-- Timezone policy:
--   call_start_time is stored as timestamptz (UTC).
--   call_date is a GENERATED column derived server-side in America/New_York timezone.
--   This ensures consistency regardless of which client or code path inserts data.


-- =============================================================================
-- 1. Ingestion Batches — audit trail for every upload
-- =============================================================================

CREATE TABLE IF NOT EXISTS rc_call_log_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  source_filename text NOT NULL,         -- original filename (no path)
  source_sha256 text NOT NULL,           -- SHA-256 hex digest of raw file bytes
  rows_total integer NOT NULL DEFAULT 0, -- total rows parsed from file
  rows_valid integer NOT NULL DEFAULT 0, -- rows that passed validation
  rows_inserted integer NOT NULL DEFAULT 0,  -- new rows written to DB
  rows_duplicate integer NOT NULL DEFAULT 0, -- rows skipped (already existed)
  rows_invalid integer NOT NULL DEFAULT 0,   -- rows that failed validation
  rows_unmatched integer NOT NULL DEFAULT 0  -- rows skipped (no employee match)
);

ALTER TABLE rc_call_log_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_call_log_batches FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rc_call_log_batches_select_admin" ON rc_call_log_batches;
CREATE POLICY "rc_call_log_batches_select_admin"
  ON rc_call_log_batches FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

DROP POLICY IF EXISTS "rc_call_log_batches_insert_admin" ON rc_call_log_batches;
CREATE POLICY "rc_call_log_batches_insert_admin"
  ON rc_call_log_batches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

COMMENT ON TABLE rc_call_log_batches IS 'Audit trail for call log uploads. Each row = one file upload. Tracks who, when, file hash, and row-level stats.';


-- =============================================================================
-- 2. Call Log Records
-- =============================================================================

CREATE TABLE IF NOT EXISTS rc_call_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  employee_user_id uuid,            -- no FK: values come from employees.auth_user_id, not auth.users
  employee_name text NOT NULL,

  -- Call data
  session_id text,                -- XLSX-only; null for CSV uploads
  call_start_time timestamptz NOT NULL,  -- always stored as UTC
  call_direction text NOT NULL CHECK (call_direction IN ('Inbound', 'Outbound')),
  call_result text NOT NULL CHECK (call_result IN ('Connected', 'Answered', 'VM/Missed')),
  call_length_seconds integer NOT NULL DEFAULT 0 CHECK (call_length_seconds >= 0 AND call_length_seconds <= 86400),
  handle_time_seconds integer CHECK (handle_time_seconds IS NULL OR (handle_time_seconds >= 0 AND handle_time_seconds <= 86400)),

  -- Server-derived day boundary in business timezone (deterministic, not client-computed)
  call_date date NOT NULL GENERATED ALWAYS AS (
    (call_start_time AT TIME ZONE 'America/New_York')::date
  ) STORED,

  -- Parties (PII-at-rest — admin-only access via RLS, masked in UI)
  from_name text,
  from_number text,
  to_name text,
  to_number text,

  -- Queue info (derived at ingest time, versioned by application code)
  queue text,       -- cleaned queue name: 'English Sales', 'English Service', etc.
  queue_type text CHECK (queue_type IS NULL OR queue_type IN ('sales', 'service', 'other')),

  -- Audit / provenance
  ingestion_batch_id uuid REFERENCES rc_call_log_batches(id),
  uploaded_by uuid,                 -- denormalized from batch; no FK to avoid insert failures
  uploaded_at timestamptz DEFAULT now(),
  source_filename text,       -- denormalized from batch for quick reference

  -- PII retention: records expire after 180 days from upload
  retention_expires_at timestamptz NOT NULL DEFAULT (now() + interval '180 days'),

  -- Prevent duplicate uploads (matched employees — employee_user_id is NOT NULL)
  UNIQUE(org_id, employee_user_id, call_start_time, call_direction, call_result)
);

-- Dedup for unmatched rows (employee_user_id IS NULL) — uses employee_name as fallback key.
-- Without this, NULLs in the UNIQUE constraint would allow unbounded duplicate inserts.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rc_call_log_dedup_unmatched
  ON rc_call_log(org_id, employee_name, call_start_time, call_direction, call_result)
  WHERE employee_user_id IS NULL;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_rc_call_log_employee_date
  ON rc_call_log(employee_user_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_org_date
  ON rc_call_log(org_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_date
  ON rc_call_log(call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_direction_result
  ON rc_call_log(call_direction, call_result);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_batch
  ON rc_call_log(ingestion_batch_id);
-- Partial index for retention purge job
CREATE INDEX IF NOT EXISTS idx_rc_call_log_retention
  ON rc_call_log(retention_expires_at) WHERE retention_expires_at IS NOT NULL;


-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Follows the same pattern as cs_performance_targets and cs_outbound_breakdown:
-- profiles.is_platform_user = true AND platform_role IN (admin roles).
-- Separate per-operation policies for clarity and auditability.

ALTER TABLE rc_call_log ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (defense in depth)
ALTER TABLE rc_call_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rc_call_log_select_admin" ON rc_call_log;
CREATE POLICY "rc_call_log_select_admin"
  ON rc_call_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

DROP POLICY IF EXISTS "rc_call_log_insert_admin" ON rc_call_log;
CREATE POLICY "rc_call_log_insert_admin"
  ON rc_call_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

DROP POLICY IF EXISTS "rc_call_log_update_admin" ON rc_call_log;
CREATE POLICY "rc_call_log_update_admin"
  ON rc_call_log FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

DROP POLICY IF EXISTS "rc_call_log_delete_admin" ON rc_call_log;
CREATE POLICY "rc_call_log_delete_admin"
  ON rc_call_log FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

COMMENT ON TABLE rc_call_log IS 'Individual call records from RingCentral Call Log exports. Primary data source for CS performance metrics. Contains PII (phone numbers) — mask in UI. 180-day retention.';
COMMENT ON COLUMN rc_call_log.from_number IS 'PII: caller phone number. Mask in UI. Subject to 180-day retention.';
COMMENT ON COLUMN rc_call_log.to_number IS 'PII: recipient phone number. Mask in UI. Subject to 180-day retention.';
COMMENT ON COLUMN rc_call_log.call_start_time IS 'Stored as UTC (timestamptz). call_date is GENERATED from this in America/New_York.';
COMMENT ON COLUMN rc_call_log.call_date IS 'GENERATED ALWAYS — server-derived from call_start_time AT TIME ZONE America/New_York. Do not set in INSERT.';
COMMENT ON COLUMN rc_call_log.retention_expires_at IS 'PII retention deadline. Records past this date are eligible for purge by a scheduled job.';
