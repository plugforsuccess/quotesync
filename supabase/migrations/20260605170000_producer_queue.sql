-- ============================================================================
-- Producer New-Business Queue
-- ============================================================================
-- Gives sales producers the same daily-queue accountability the retention team
-- already has — closing the gap where producers could run their whole day
-- without QuoteSync. Mirrors the retention pattern on the leads side.
--
-- The live leads table has no per-producer assignment column, so we add one
-- (assigned_to_id → employees). For a single-agent captive the queue shows the
-- agency's open leads (assigned-to-me OR unassigned); the column makes
-- multi-producer assignment possible later.
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to_id      UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attempt_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attempt_result TEXT,
  ADD COLUMN IF NOT EXISTS next_followup_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS callback_note       TEXT,
  ADD COLUMN IF NOT EXISTS snoozed_until       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS snooze_reason       TEXT;

-- Queue lookup: the agency's open, non-snoozed leads, soonest follow-up first.
CREATE INDEX IF NOT EXISTS leads_producer_queue_idx
  ON public.leads (agency_id, status, next_followup_at);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx
  ON public.leads (assigned_to_id);

-- ─── lead_attempts (per-touch log, mirrors pending_cancel_attempts) ───────────
CREATE TABLE IF NOT EXISTS public.lead_attempts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agency_id    UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  employee_id  UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  method       TEXT NOT NULL DEFAULT 'phone'
                 CHECK (method IN ('phone', 'text', 'email', 'other')),
  result       TEXT NOT NULL
                 CHECK (result IN (
                   'no_answer', 'left_voicemail', 'wrong_number',
                   'reached', 'busy', 'disconnected'
                 )),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_attempts_lead_idx     ON public.lead_attempts (lead_id);
CREATE INDEX IF NOT EXISTS lead_attempts_employee_idx ON public.lead_attempts (employee_id, attempted_at);

ALTER TABLE public.lead_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency members manage lead_attempts" ON public.lead_attempts;
CREATE POLICY "Agency members manage lead_attempts"
  ON public.lead_attempts FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM public.agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

COMMENT ON TABLE public.lead_attempts IS
  'Per-touch log for new-business leads — the producer-side parallel of pending_cancel_attempts / renewal_attempts.';
