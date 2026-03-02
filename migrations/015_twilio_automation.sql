-- Migration 015: Twilio SMS Automation & Speed-to-Call
-- Adds columns to leads table for SMS/call tracking, creates lead_messages table,
-- updates audit_log and leads status constraints for new event types.

-- ============================================================================
-- LEADS TABLE: Add contact and automation columns
-- ============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS owns_home BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vehicle_count INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_sent BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_sent_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_initiated BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_initiated_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_connected BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_connected_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS drip_stage INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disposition TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'canopy';

-- Index for drip query (non-responsive leads lookup)
CREATE INDEX IF NOT EXISTS idx_leads_drip ON leads(sms_sent, call_connected, sms_opted_out, status, drip_stage);
-- Index for phone lookup (inbound SMS matching)
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone) WHERE phone IS NOT NULL;

-- ============================================================================
-- LEADS TABLE: Expand status constraint to include 'interested'
-- ============================================================================
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status IN ('partial', 'new', 'contacted', 'interested', 'qualified', 'closed_won', 'closed_lost'));

-- ============================================================================
-- AUDIT_LOG TABLE: Expand event_type constraint for Twilio events
-- ============================================================================
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK',
    'STATUS_CHANGED', 'ASSIGNED',
    'SMS_SENT', 'SMS_INBOUND', 'SMS_DRIP_SENT',
    'CALL_INITIATED', 'CALL_CONNECTED', 'CALL_MISSED',
    'CANOPY_WEBHOOK_RECEIVED', 'ENRICHMENT_ORPHAN_PULL'
  ));

-- ============================================================================
-- LEAD_MESSAGES TABLE: SMS/call message history
-- ============================================================================
CREATE TABLE IF NOT EXISTS lead_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'call', 'email')),
  body TEXT,
  twilio_sid TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_messages_lead ON lead_messages(lead_id);

-- ============================================================================
-- ROW LEVEL SECURITY for lead_messages
-- ============================================================================
ALTER TABLE lead_messages ENABLE ROW LEVEL SECURITY;

-- Agency users can view messages for their leads
DROP POLICY IF EXISTS "Agency users can view their lead messages" ON lead_messages;
CREATE POLICY "Agency users can view their lead messages"
  ON lead_messages FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN agency_users au ON au.agency_id = l.agency_id
      WHERE au.user_id = auth.uid()
    )
  );

-- Service role can insert messages (used by Edge Functions)
DROP POLICY IF EXISTS "Service role can insert lead messages" ON lead_messages;
CREATE POLICY "Service role can insert lead messages"
  ON lead_messages FOR INSERT
  WITH CHECK (true);

-- Service role can update lead messages (status updates from Twilio callbacks)
DROP POLICY IF EXISTS "Service role can update lead messages" ON lead_messages;
CREATE POLICY "Service role can update lead messages"
  ON lead_messages FOR UPDATE
  USING (true);

-- ============================================================================
-- CRON: Schedule drip SMS check every 30 minutes (requires pg_cron + pg_net)
-- NOTE: Run this manually in Supabase SQL Editor after enabling the extensions:
-- ============================================================================
-- SELECT cron.schedule(
--   'lead-sms-drip',
--   '*/30 * * * *',
--   $$
--   SELECT net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/lead-sms-drip',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
