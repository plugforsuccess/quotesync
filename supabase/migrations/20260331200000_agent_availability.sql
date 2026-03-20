-- Agent availability table for Bland AI live transfer routing
CREATE TABLE IF NOT EXISTS agent_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT FALSE,
  transfer_phone TEXT,                          -- E.164 direct number for Bland transfer
  priority_tier INTEGER NOT NULL DEFAULT 1,     -- 0 = principal, 1+ = producers (round-robin)
  last_toggled_at TIMESTAMPTZ,
  auto_reset_at TIMESTAMPTZ,                    -- set to 8pm Eastern on toggle-on
  notes TEXT,                                   -- optional: "on lunch", "in meeting", etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agency_id, user_id)
);

-- Enforce only one priority_tier = 0 per agency
CREATE UNIQUE INDEX agent_availability_one_principal_per_agency
  ON agent_availability (agency_id)
  WHERE priority_tier = 0;

-- RLS
ALTER TABLE agent_availability ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own row
CREATE POLICY "Agent manages own availability"
  ON agent_availability FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- All active agency members can read availability (for dashboard display)
CREATE POLICY "Agency members read availability"
  ON agent_availability FOR SELECT
  USING (
    agency_id IN (
      SELECT agency_id FROM public.agency_memberships
      WHERE user_id = auth.uid()
        AND status = 'active'
    )
  );

-- Service role full access (Edge Functions)
CREATE POLICY "Service role full access agent_availability"
  ON agent_availability FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_agent_availability_agency
  ON agent_availability(agency_id);

CREATE INDEX IF NOT EXISTS idx_agent_availability_available
  ON agent_availability(agency_id, available);

-- Add bland_outbound columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bland_outbound_call_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS bland_outbound_status TEXT
  CHECK (bland_outbound_status IN ('pending', 'completed', 'failed', 'no_answer'));

-- Seed Cameron's row (priority_tier = 0, principal)
-- transfer_phone is NULL until Cameron sets it in the UI
INSERT INTO agent_availability (agency_id, user_id, available, priority_tier, transfer_phone)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  (SELECT id FROM auth.users WHERE email = 'insuredbycam@gmail.com' LIMIT 1),
  FALSE,
  0,
  NULL
)
ON CONFLICT (agency_id, user_id) DO NOTHING;

-- Auto-reset via pg_cron: reset all available = false at 8pm ET daily
-- 1:00 AM UTC = 8:00 PM ET (EDT/UTC-4). Fires at 9pm ET during EST — acceptable.
SELECT cron.schedule(
  'reset-agent-availability',
  '0 1 * * *',
  $$
    UPDATE public.agent_availability
    SET available = FALSE, updated_at = NOW()
    WHERE available = TRUE;
  $$
);

-- Extend audit_log CHECK constraint to include new availability event types
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK',
    'STATUS_CHANGED', 'ASSIGNED', 'LEAD_STATUS_UPDATED',
    'LEAD_DISPOSED',
    'SMS_SENT', 'SMS_INBOUND', 'SMS_DRIP_SENT', 'SMS_DRIP_FAILED', 'SMS_MANUAL_SENT',
    'CALL_INITIATED', 'CALL_CONNECTED', 'CALL_MISSED',
    'CANOPY_WEBHOOK_RECEIVED', 'ENRICHMENT_ORPHAN_PULL',
    'ENRICHMENT_STARTED', 'ENRICHMENT_SUCCEEDED', 'ENRICHMENT_FAILED',
    'AGENT_AVAILABILITY_ON',
    'AGENT_AVAILABILITY_OFF',
    'AGENT_AVAILABILITY_AUTO_RESET',
    'AGENT_TRANSFER_PHONE_SET',
    'BLAND_OUTBOUND_INITIATED',
    'BLAND_OUTBOUND_FAILED'
  ));
