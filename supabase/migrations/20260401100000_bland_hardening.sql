-- 022_bland_hardening.sql
-- Closes remaining gaps in the Bland AI integration.

-- ── leads: columns already referenced by sendCanopyLink and bland-webhook ────
-- These columns are called in code but not yet in the DB schema.

ALTER TABLE leads
  -- sendCanopyLink reads and writes these:
  ADD COLUMN IF NOT EXISTS canopy_link_sent        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canopy_link_sent_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS canopy_send_pending     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Gap 3: drip_scenario for Bland-aware drip routing
  -- Note: drip_stage already exists — do NOT re-add it
  ADD COLUMN IF NOT EXISTS drip_scenario           TEXT,

  -- Gap 4: no-answer retry tracking
  ADD COLUMN IF NOT EXISTS bland_retry_count       INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bland_retry_at          TIMESTAMPTZ;

-- ── bland_call_logs: transfer outcome detail (Gap 7) ─────────────────────────
ALTER TABLE bland_call_logs
  ADD COLUMN IF NOT EXISTS transferred_to_phone    TEXT,
  ADD COLUMN IF NOT EXISTS transfer_outcome        TEXT
    CHECK (transfer_outcome IN ('connected', 'no-answer', 'failed'));

-- transferred_to_name is already on bland_call_logs from the 020_bland_ai migration.

-- ── Extend audit_log CHECK constraint ─────────────────────────────────────────
-- Drop and recreate with the complete list of all event types.
-- This supersedes all previous constraint versions.
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_event_type_check;
ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_event_type_check CHECK (event_type = ANY (ARRAY[
    -- pre-existing --
    'LEAD_CREATED', 'ROUTED', 'NOTIFIED', 'ROUTING_FALLBACK', 'STATUS_CHANGED',
    'ASSIGNED', 'LEAD_STATUS_UPDATED', 'LEAD_DISPOSED', 'SMS_SENT', 'SMS_INBOUND',
    'SMS_DRIP_SENT', 'SMS_DRIP_FAILED', 'SMS_MANUAL_SENT', 'CALL_INITIATED',
    'CALL_CONNECTED', 'CALL_MISSED', 'CANOPY_WEBHOOK_RECEIVED', 'ENRICHMENT_ORPHAN_PULL',
    'ENRICHMENT_STARTED', 'ENRICHMENT_SUCCEEDED', 'ENRICHMENT_FAILED',
    -- availability routing --
    'AGENT_AVAILABILITY_ON', 'AGENT_AVAILABILITY_OFF',
    'AGENT_AVAILABILITY_AUTO_RESET', 'AGENT_TRANSFER_PHONE_SET',
    -- bland ai integration --
    'BLAND_OUTBOUND_INITIATED', 'BLAND_OUTBOUND_FAILED', 'BLAND_OUTBOUND_TRANSFERRED',
    'BLAND_TRANSFER_MISSED', 'LEAD_QUALIFIED_BLAND', 'LEAD_DISQUALIFIED_BLAND',
    'BLAND_INBOUND_TRANSFERRED', 'BLAND_CALLBACK_REQUESTED', 'BLAND_WEBHOOK_ERROR',
    'CANOPY_LINK_SENT_BLAND', 'BLAND_INBOUND_EXISTING_CUSTOMER',
    'CANOPY_SEND_DEFERRED_NO_TRANSCRIPT', 'LEAD_ACTIVATED',
    -- bland hardening --
    'BLAND_RETRY_SCHEDULED',
    'BLAND_HANDOFF_TO_DRIP',
    'CANOPY_SEND_RETRY_SUCCESS',
    'BLAND_INBOUND_PARTIAL_CAPTURE'
  ]));

-- ── pg_cron: retry deferred Canopy link sends every 5 minutes ─────────────────
SELECT cron.schedule(
  'retry-canopy-sends',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/canopy-send-retry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);

-- ── pg_cron: poll for pending Bland retries every 2 minutes ───────────────────
SELECT cron.schedule(
  'bland-outbound-retry',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/bland-retry-poll',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
