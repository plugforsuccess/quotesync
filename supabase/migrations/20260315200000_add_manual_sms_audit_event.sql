-- Add SMS_MANUAL_SENT and SMS_DRIP_FAILED to audit_log event_type constraint
-- These events are logged by send-manual-sms and lead-sms-drip Edge Functions

-- Drop and recreate the constraint to include new event types
-- (Only if the constraint exists — safe to run idempotently)
DO $$
BEGIN
  -- Attempt to drop existing constraint
  ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_event_type_check;

  -- Recreate with expanded event types
  ALTER TABLE audit_log ADD CONSTRAINT audit_log_event_type_check
    CHECK (event_type IN (
      'LEAD_CREATED',
      'LEAD_STATUS_UPDATED',
      'LEAD_FIRST_CONTACT_SET',
      'SMS_SENT',
      'SMS_DRIP_SENT',
      'SMS_DRIP_FAILED',
      'SMS_MANUAL_SENT',
      'CALL_INITIATED',
      'CALL_MISSED',
      'ENRICHMENT_STARTED',
      'ENRICHMENT_SUCCEEDED',
      'ENRICHMENT_FAILED'
    ));
EXCEPTION
  WHEN others THEN
    -- If constraint doesn't exist or table structure differs, skip gracefully
    RAISE NOTICE 'Could not update audit_log event_type constraint: %', SQLERRM;
END;
$$;
