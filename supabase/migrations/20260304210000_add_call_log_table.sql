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
-- PII note:
--   from_number / to_number contain phone numbers. These are stored for operational matching
--   only and should be masked in all UI display. Never log raw phone numbers.

CREATE TABLE IF NOT EXISTS rc_call_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  employee_user_id uuid REFERENCES auth.users(id),
  employee_name text NOT NULL,

  -- Call data
  session_id text,                -- XLSX-only; null for CSV uploads
  call_date date NOT NULL,
  call_start_time timestamptz NOT NULL,  -- always stored as UTC
  call_direction text NOT NULL CHECK (call_direction IN ('Inbound', 'Outbound')),
  call_result text NOT NULL CHECK (call_result IN ('Connected', 'Answered', 'VM/Missed')),
  call_length_seconds integer NOT NULL DEFAULT 0 CHECK (call_length_seconds >= 0 AND call_length_seconds <= 86400),
  handle_time_seconds integer CHECK (handle_time_seconds IS NULL OR (handle_time_seconds >= 0 AND handle_time_seconds <= 86400)),

  -- Parties (PII — mask in UI, never log raw values)
  from_name text,
  from_number text,
  to_name text,
  to_number text,

  -- Queue info (derived at ingest time, versioned by application code)
  queue text,       -- cleaned queue name: 'English Sales', 'English Service', etc.
  queue_type text CHECK (queue_type IS NULL OR queue_type IN ('sales', 'service', 'other')),

  -- Metadata / audit
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),
  source_filename text,       -- original filename (no path) for audit trail

  -- Prevent duplicate uploads
  UNIQUE(org_id, employee_user_id, call_start_time, call_direction, call_result)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_rc_call_log_employee_date
  ON rc_call_log(employee_user_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_org_date
  ON rc_call_log(org_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_date
  ON rc_call_log(call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_direction_result
  ON rc_call_log(call_direction, call_result);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Follows the same pattern as cs_performance_targets and cs_outbound_breakdown:
-- profiles.is_platform_user = true AND platform_role IN (admin roles).
-- Separate per-operation policies for clarity and auditability.

ALTER TABLE rc_call_log ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners (defense in depth)
ALTER TABLE rc_call_log FORCE ROW LEVEL SECURITY;

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

COMMENT ON TABLE rc_call_log IS 'Individual call records from RingCentral Call Log exports. Primary data source for CS performance metrics. Contains PII (phone numbers) — mask in UI.';
COMMENT ON COLUMN rc_call_log.from_number IS 'PII: caller phone number. Mask in UI display.';
COMMENT ON COLUMN rc_call_log.to_number IS 'PII: recipient phone number. Mask in UI display.';
COMMENT ON COLUMN rc_call_log.call_start_time IS 'Stored as UTC (timestamptz). Day boundaries computed in America/New_York.';
