-- Add rc_queue_data table for RingCentral Queues report data.
-- Captures per-queue daily metrics (inbound, answered, abandoned) that the
-- Call Log cannot see — calls that enter queues but never reach an agent.

CREATE TABLE IF NOT EXISTS rc_queue_data (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id),

  -- Date range (extracted from Filters sheet)
  report_date date NOT NULL,

  -- Queue identification
  queue_name text NOT NULL,        -- '0C2667 English Service'
  queue_ext text,                   -- '24449901'
  queue_type text,                  -- 'sales', 'service', 'ld'

  -- Metrics
  inbound integer DEFAULT 0,
  answered integer DEFAULT 0,
  abandoned integer DEFAULT 0,
  avg_handle_time_seconds integer DEFAULT 0,
  holds integer DEFAULT 0,
  refused integer DEFAULT 0,

  -- Derived
  abandon_rate numeric(5,2) DEFAULT 0,  -- abandoned / inbound * 100

  -- Metadata
  uploaded_by uuid REFERENCES auth.users(id),
  uploaded_at timestamptz DEFAULT now(),

  -- Prevent duplicate uploads
  UNIQUE(org_id, report_date, queue_name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rc_queue_data_org_date
  ON rc_queue_data(org_id, report_date);
CREATE INDEX IF NOT EXISTS idx_rc_queue_data_date
  ON rc_queue_data(report_date);

-- RLS (same policy pattern as rc_call_log)
ALTER TABLE rc_queue_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage queue data"
  ON rc_queue_data FOR ALL
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

COMMENT ON TABLE rc_queue_data IS 'Per-queue daily metrics from RingCentral Queues report. Captures abandoned calls that never reach an agent.';
