-- Migration: Add rc_call_log table for individual call records from RingCentral Call Log exports.
-- This becomes the primary data source for CS performance metrics.

CREATE TABLE IF NOT EXISTS rc_call_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),
  employee_user_id uuid REFERENCES auth.users(id),
  employee_name text NOT NULL,

  -- Call data
  session_id text,
  call_date date NOT NULL,
  call_start_time timestamptz NOT NULL,
  call_direction text NOT NULL CHECK (call_direction IN ('Inbound', 'Outbound')),
  call_result text NOT NULL,  -- 'Connected', 'Answered', 'VM/Missed'
  call_length_seconds integer DEFAULT 0,
  handle_time_seconds integer,

  -- Parties
  from_name text,
  from_number text,
  to_name text,
  to_number text,

  -- Queue info
  queue text,       -- 'English Sales', 'English Service', null
  queue_type text,  -- 'sales', 'service', null (derived from queue name)

  -- Metadata
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),

  -- Prevent duplicate uploads: same agent + same call start time + same direction + same result
  UNIQUE(org_id, employee_user_id, call_start_time, call_direction, call_result)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_rc_call_log_employee_date
  ON rc_call_log(employee_user_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_org_date
  ON rc_call_log(org_id, call_date);
CREATE INDEX IF NOT EXISTS idx_rc_call_log_date
  ON rc_call_log(call_date);

-- RLS
ALTER TABLE rc_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage call logs"
  ON rc_call_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_users pu
      WHERE pu.user_id = auth.uid()
      AND pu.role IN ('platform_admin', 'platform_master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_users pu
      WHERE pu.user_id = auth.uid()
      AND pu.role IN ('platform_admin', 'platform_master_admin')
    )
  );

COMMENT ON TABLE rc_call_log IS 'Individual call records from RingCentral Call Log exports. Primary data source for CS performance metrics.';
