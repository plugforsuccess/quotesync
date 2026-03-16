-- ============================================================================
-- Disposition Codes + Attempt Log
-- Updates status constraints for pending_cancel_events and renewal_events.
-- Adds renewal_attempts and pending_cancel_attempts tables for per-attempt logging.
-- ============================================================================

-- ── Pending Cancel Events: expanded status constraint ─────────────────────
ALTER TABLE pending_cancel_events DROP CONSTRAINT IF EXISTS pending_cancel_events_status_check;
ALTER TABLE pending_cancel_events ADD CONSTRAINT pending_cancel_events_status_check
  CHECK (status IN (
    'pending',                -- not yet attempted
    'attempting',             -- attempts made, customer not yet reached
    'left_voicemail',         -- left voicemail, awaiting callback
    'contacted',              -- reached customer (legacy — kept for existing rows)
    'payment_plan_requested', -- reached — customer wants payment arrangement
    'promise_to_pay',         -- reached — customer committed to pay by date
    'saved',                  -- policy retained
    'promise_broken',         -- promised to pay but didn't
    'requested_cancellation', -- customer confirmed they want to cancel
    'lost',                   -- policy cancelled/lapsed
    'auto_resolved'           -- system closed (cancel date passed)
  ));

-- Add attempt tracking columns to pending_cancel_events
ALTER TABLE pending_cancel_events
  ADD COLUMN IF NOT EXISTS attempt_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_result TEXT
    CHECK (last_attempt_result IN (
      'no_answer', 'left_voicemail', 'wrong_number',
      'reached', 'busy', 'disconnected'
    ));

-- ── Renewal Events: expanded status constraint ────────────────────────────
ALTER TABLE renewal_events DROP CONSTRAINT IF EXISTS renewal_events_status_check;
ALTER TABLE renewal_events ADD CONSTRAINT renewal_events_status_check
  CHECK (status IN (
    'pending',              -- not yet attempted
    'attempting',           -- attempts made, customer not yet reached
    'left_voicemail',       -- left voicemail, awaiting callback
    'review_requested',     -- reached — customer wants policy review
    'shopping',             -- reached — actively shopping competitors
    'confirmed',            -- reached — renewing, satisfied
    'at_risk',              -- reached — payment issue or unhappy
    'escalated',            -- escalated to agent for retention quote
    'lost',                 -- did not renew
    'unreachable',          -- max attempts, couldn't reach
    'auto_resolved'         -- renewal date passed without resolution
  ));

-- Add attempt tracking columns to renewal_events
ALTER TABLE renewal_events
  ADD COLUMN IF NOT EXISTS attempt_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_result TEXT
    CHECK (last_attempt_result IN (
      'no_answer', 'left_voicemail', 'wrong_number',
      'reached', 'busy', 'disconnected'
    ));

-- Add shopping_reason column to renewal_events
ALTER TABLE renewal_events
  ADD COLUMN IF NOT EXISTS shopping_reason TEXT;

-- ── Attempt log: renewal_attempts ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.renewal_attempts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_event_id UUID NOT NULL REFERENCES renewal_events(id) ON DELETE CASCADE,
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  attempted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method          TEXT NOT NULL CHECK (method IN ('phone', 'text', 'email', 'other')),
  result          TEXT NOT NULL CHECK (result IN (
    'no_answer',       -- rang, no answer
    'left_voicemail',  -- left a voicemail
    'wrong_number',    -- not the insured's number
    'reached',         -- spoke to the insured
    'busy',            -- line busy
    'disconnected'     -- number disconnected
  )),
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS renewal_attempts_event_idx
  ON renewal_attempts (renewal_event_id);
CREATE INDEX IF NOT EXISTS renewal_attempts_employee_idx
  ON renewal_attempts (employee_id, attempted_at);

ALTER TABLE renewal_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage renewal_attempts"
  ON renewal_attempts FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ── Attempt log: pending_cancel_attempts ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_cancel_attempts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_cancel_event_id UUID NOT NULL REFERENCES pending_cancel_events(id) ON DELETE CASCADE,
  agency_id             UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id           UUID REFERENCES employees(id) ON DELETE SET NULL,
  attempted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method                TEXT NOT NULL CHECK (method IN ('phone', 'text', 'email', 'other')),
  result                TEXT NOT NULL CHECK (result IN (
    'no_answer', 'left_voicemail', 'wrong_number',
    'reached', 'busy', 'disconnected'
  )),
  note                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pending_cancel_attempts_event_idx
  ON pending_cancel_attempts (pending_cancel_event_id);
CREATE INDEX IF NOT EXISTS pending_cancel_attempts_employee_idx
  ON pending_cancel_attempts (employee_id, attempted_at);

ALTER TABLE pending_cancel_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage pending_cancel_attempts"
  ON pending_cancel_attempts FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));
