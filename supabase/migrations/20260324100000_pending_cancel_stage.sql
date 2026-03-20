-- Add stage column
ALTER TABLE public.pending_cancel_events
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'pending_cancel'
    CHECK (stage IN ('pending_cancel', 'cancelled'));

-- Add amount_due column (current balance to reinstate — different from premium_at_risk)
ALTER TABLE public.pending_cancel_events
  ADD COLUMN IF NOT EXISTS amount_due NUMERIC(10,2);

-- Add 'cancelled' status value
ALTER TABLE public.pending_cancel_events
  DROP CONSTRAINT IF EXISTS pending_cancel_events_status_check;

ALTER TABLE public.pending_cancel_events
  ADD CONSTRAINT pending_cancel_events_status_check
  CHECK (status IN (
    'pending',
    'attempting',
    'left_voicemail',
    'contacted',
    'payment_plan_requested',
    'promise_to_pay',
    'promise_broken',
    'requested_cancellation',
    'saved',
    'lost',
    'cancelled',
    'auto_resolved'
  ));

-- Cancellation upload audit trail
CREATE TABLE IF NOT EXISTS public.cancellation_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename      TEXT,
  rows_added    INT NOT NULL DEFAULT 0,
  rows_updated  INT NOT NULL DEFAULT 0,
  committed     BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.cancellation_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage cancellation_uploads"
  ON public.cancellation_uploads FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));
