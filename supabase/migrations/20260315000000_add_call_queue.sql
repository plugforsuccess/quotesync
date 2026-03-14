-- Add call_queue table for decoupling SMS and call initiation
-- lead-notify-sms inserts a row; lead-initiate-call (via pg_cron) processes it

CREATE TABLE IF NOT EXISTS call_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  first_name TEXT,
  zip TEXT,
  owns_home BOOLEAN,
  vehicle_count INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  fire_after TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_call_queue_pending
  ON call_queue(status, fire_after)
  WHERE status = 'pending';

ALTER TABLE call_queue ENABLE ROW LEVEL SECURITY;
-- Only service role accesses this table (Edge Functions only)

-- pg_cron schedule for lead-initiate-call
-- Run manually in Supabase SQL Editor after enabling pg_cron + pg_net:
-- SELECT cron.schedule(
--   'lead-initiate-call',
--   '*/1 * * * *',
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/lead-initiate-call',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
