-- 020_bland_ai.sql
-- Add Bland AI tracking columns to leads and create bland_call_logs table.
-- Note: bland_outbound_call_id and bland_outbound_status were added in
-- 20260331200000_agent_availability.sql. This migration adds the remaining columns.

-- Extend bland_outbound_status to include 'in_progress' (original CHECK was more restrictive)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_bland_outbound_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_bland_outbound_status_check
  CHECK (bland_outbound_status IN ('pending', 'in_progress', 'completed', 'failed', 'no_answer', 'no-answer'));

-- Additional Bland tracking columns on leads
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS bland_verified BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bland_qualified BOOLEAN,
  ADD COLUMN IF NOT EXISTS bland_disqualify_reason TEXT,
  ADD COLUMN IF NOT EXISTS bland_canopy_offered BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bland_canopy_accepted BOOLEAN,
  ADD COLUMN IF NOT EXISTS bland_inbound_call_id TEXT,
  ADD COLUMN IF NOT EXISTS bland_call_transcript TEXT,
  ADD COLUMN IF NOT EXISTS bland_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bland_qualified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bland_partial_capture BOOLEAN DEFAULT FALSE;

-- Bland call log table (one row per call, inbound or outbound)
CREATE TABLE IF NOT EXISTS bland_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  call_id TEXT NOT NULL UNIQUE,
  call_type TEXT NOT NULL CHECK (call_type IN ('outbound_verification', 'inbound')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_number TEXT,
  status TEXT,
  duration_seconds INTEGER,
  qualified BOOLEAN,
  disqualify_reason TEXT,
  canopy_offered BOOLEAN DEFAULT FALSE,
  canopy_accepted BOOLEAN,
  transferred BOOLEAN DEFAULT FALSE,
  transferred_to_name TEXT,
  transcript TEXT,
  variables JSONB,
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS on bland_call_logs
ALTER TABLE bland_call_logs ENABLE ROW LEVEL SECURITY;

-- Agency members can read call logs for their agency's leads
-- Uses agency_memberships (agency_users has been dropped)
CREATE POLICY "Agency members read their call logs"
  ON bland_call_logs FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      JOIN public.agency_memberships am
        ON am.agency_id = l.agency_id
        AND am.user_id  = auth.uid()
        AND am.status   = 'active'
    )
  );

-- Service role full access
CREATE POLICY "Service role full access bland_call_logs"
  ON bland_call_logs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_bland_call_logs_lead_id ON bland_call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_bland_call_logs_call_id ON bland_call_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_bland_call_logs_created_at ON bland_call_logs(created_at DESC);

-- Extend audit_log CHECK constraint to include Bland event types
-- This replaces the constraint from both agent_availability and bland_webhook_audit_events migrations
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_event_type_check CHECK (event_type = ANY (ARRAY[
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK', 'STATUS_CHANGED',
    'ASSIGNED', 'LEAD_STATUS_UPDATED', 'LEAD_DISPOSED', 'SMS_SENT', 'SMS_INBOUND',
    'SMS_DRIP_SENT', 'SMS_DRIP_FAILED', 'SMS_MANUAL_SENT', 'CALL_INITIATED',
    'CALL_CONNECTED', 'CALL_MISSED', 'CANOPY_WEBHOOK_RECEIVED', 'ENRICHMENT_ORPHAN_PULL',
    'ENRICHMENT_STARTED', 'ENRICHMENT_SUCCEEDED', 'ENRICHMENT_FAILED',
    'AGENT_AVAILABILITY_ON', 'AGENT_AVAILABILITY_OFF',
    'AGENT_AVAILABILITY_AUTO_RESET', 'AGENT_TRANSFER_PHONE_SET',
    'BLAND_OUTBOUND_INITIATED', 'BLAND_OUTBOUND_FAILED', 'BLAND_OUTBOUND_TRANSFERRED',
    'BLAND_TRANSFER_MISSED', 'LEAD_QUALIFIED_BLAND', 'LEAD_DISQUALIFIED_BLAND',
    'BLAND_INBOUND_TRANSFERRED', 'BLAND_CALLBACK_REQUESTED', 'BLAND_WEBHOOK_ERROR',
    'CANOPY_LINK_SENT_BLAND', 'BLAND_INBOUND_EXISTING_CUSTOMER',
    'CANOPY_SEND_DEFERRED_NO_TRANSCRIPT', 'LEAD_ACTIVATED'
  ]));
