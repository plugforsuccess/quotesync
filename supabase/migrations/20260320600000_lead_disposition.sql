-- Add disposition_reason to leads for closed_lost records
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disposition_reason TEXT
  CHECK (disposition_reason IN (
    'not_interested',
    'unreachable',
    'bad_risk',
    'wrong_territory',
    'already_insured_elsewhere',
    'quoted_in_lm',
    'other'
  ));

ALTER TABLE leads ADD COLUMN IF NOT EXISTS disposition_note TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disposed_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS disposed_by UUID REFERENCES auth.users(id);

-- Expand audit_log event_type to include disposition events
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
  CHECK (event_type IN (
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK',
    'STATUS_CHANGED', 'ASSIGNED', 'LEAD_STATUS_UPDATED',
    'LEAD_DISPOSED',
    'SMS_SENT', 'SMS_INBOUND', 'SMS_DRIP_SENT', 'SMS_DRIP_FAILED', 'SMS_MANUAL_SENT',
    'CALL_INITIATED', 'CALL_CONNECTED', 'CALL_MISSED',
    'CANOPY_WEBHOOK_RECEIVED', 'ENRICHMENT_ORPHAN_PULL',
    'ENRICHMENT_STARTED', 'ENRICHMENT_SUCCEEDED', 'ENRICHMENT_FAILED'
  ));
