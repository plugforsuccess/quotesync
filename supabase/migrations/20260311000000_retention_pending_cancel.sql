-- =============================================================================
-- Retention Dashboard — Pending Cancellation Tables
-- Phase 1: pending_cancel_events + pending_cancel_uploads
-- =============================================================================

-- ── pending_cancel_events ─────────────────────────────────────────────────
-- One row per unique cancel notice (policy_no + cancel_effective_date)
-- A policy can have multiple rows if it appears across multiple billing cycles

CREATE TABLE IF NOT EXISTS public.pending_cancel_events (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- From report
  policy_no             text NOT NULL,
  customer_name         text,
  product               text,                         -- auto, ho, renters, other
  premium_at_risk       numeric(10,2),
  cancel_effective_date date NOT NULL,
  cycle                 int NOT NULL DEFAULT 1,        -- increments on reappearance

  -- Admin workflow
  status                text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending','contacted','promise_to_pay',
      'saved','promise_broken','requested_cancellation','lost','auto_resolved'
    )),
  assigned_to           text,                         -- free text until producer logins
  contacted_at          timestamptz,
  contact_method        text CHECK (contact_method IN ('phone','text','email','other')),
  promise_date          date,                         -- customer promised to pay by this date
  resolution_date       date,
  termination_reason    text,                         -- price, service, claims, moving, coverage
  notes                 text,

  -- Upload tracking
  first_seen_on         date NOT NULL,                -- date first uploaded
  last_seen_on          date NOT NULL,                -- date of most recent upload that included it
  upload_batch_id       uuid,                         -- links to pending_cancel_uploads

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Dedup key: one row per policy per cancel cycle
CREATE UNIQUE INDEX pending_cancel_events_policy_date_cycle_idx
  ON pending_cancel_events (agency_id, policy_no, cancel_effective_date, cycle);

CREATE INDEX pending_cancel_events_agency_status_idx
  ON pending_cancel_events (agency_id, status);

CREATE INDEX pending_cancel_events_cancel_date_idx
  ON pending_cancel_events (agency_id, cancel_effective_date);

-- ── pending_cancel_uploads ────────────────────────────────────────────────
-- Tracks each uploaded report for audit trail

CREATE TABLE IF NOT EXISTS public.pending_cancel_uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  uploaded_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  filename      text,
  report_date   date,                                 -- date on the report itself
  rows_added    int NOT NULL DEFAULT 0,
  rows_updated  int NOT NULL DEFAULT 0,
  rows_auto_resolved int NOT NULL DEFAULT 0,
  committed     boolean NOT NULL DEFAULT false        -- false = preview, true = confirmed
);

-- ── Updated_at trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pending_cancel_updated_at ON public.pending_cancel_events;
CREATE TRIGGER trg_pending_cancel_updated_at
  BEFORE UPDATE ON public.pending_cancel_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.pending_cancel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pending_cancel_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_pending_cancel_events"
ON public.pending_cancel_events FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin','platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin','platform_master_admin')
  )
);

CREATE POLICY "admin_all_pending_cancel_uploads"
ON public.pending_cancel_uploads FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin','platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin','platform_master_admin')
  )
);
