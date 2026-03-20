-- Already applied to remote; local file was removed.
-- This placeholder prevents supabase db push from re-running the migration.
-- Lapse tracking tables for Retention Dashboard
-- lapse_uploads must be created first (referenced by lapse_events)

CREATE TABLE IF NOT EXISTS public.lapse_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES auth.users(id),
  filename      TEXT,
  report_month  DATE NOT NULL,
  rows_added    INT DEFAULT 0,
  rows_updated  INT DEFAULT 0,
  committed     BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lapse_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  policy_no           TEXT NOT NULL,
  customer_name       TEXT,
  product             TEXT,           -- normalised: auto | ho | renters | landlord | specialty_auto | pup | manufactured | other
  product_raw         TEXT,           -- raw string from upload
  premium             NUMERIC(10,2),
  item_count          INTEGER NOT NULL DEFAULT 1,  -- vehicles/items; locked to 1 for non-auto products
  lapse_date          DATE,           -- effective date of termination
  termination_reason  TEXT,
  upload_batch_id     UUID REFERENCES public.lapse_uploads(id) ON DELETE SET NULL,
  report_month        DATE NOT NULL,  -- first day of the month this report covers (e.g. 2026-03-01)
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS lapse_events_policy_month_idx
  ON public.lapse_events (agency_id, policy_no, report_month);

-- RLS: same pattern as pending_cancel_events
ALTER TABLE public.lapse_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lapse_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Agency members can manage lapse_events" ON public.lapse_events;
CREATE POLICY "Agency members can manage lapse_events"
  ON public.lapse_events FOR ALL
  USING (agency_id = (SELECT org_id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1));

DROP POLICY IF EXISTS "Agency members can manage lapse_uploads" ON public.lapse_uploads;
CREATE POLICY "Agency members can manage lapse_uploads"
  ON public.lapse_uploads FOR ALL
  USING (agency_id = (SELECT org_id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1));
