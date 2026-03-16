-- ── renewal_events ──────────────────────────────────────────────────────────
-- Allstate "Upcoming Renewals" / "Renewal Review" report upload destination.
-- Tracks policies coming up for renewal where proactive outreach may prevent
-- a lapse or shopping-away event.

CREATE TABLE IF NOT EXISTS public.renewal_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  -- From report
  policy_no           TEXT NOT NULL,
  customer_name       TEXT,
  product             TEXT,       -- normalised: auto | ho | renters | other
  product_raw         TEXT,
  premium             NUMERIC(10,2),
  item_count          INTEGER NOT NULL DEFAULT 1,
  renewal_date        DATE NOT NULL,        -- date policy renews
  phone               TEXT,

  -- Admin workflow
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',            -- not yet contacted
      'contacted',          -- outreach made
      'confirmed',          -- customer confirmed renewal
      'at_risk',            -- customer expressed intent to cancel/shop
      'lost',               -- customer cancelled at renewal
      'auto_resolved'       -- renewal date passed without action
    )),
  assigned_to_id      UUID REFERENCES employees(id) ON DELETE SET NULL,
  contacted_at        TIMESTAMPTZ,
  contact_method      TEXT CHECK (contact_method IN ('phone','text','email','other')),
  notes               TEXT,
  resolution_date     DATE,

  -- Upload tracking
  first_seen_on       DATE NOT NULL,
  last_seen_on        DATE NOT NULL,
  upload_batch_id     UUID,

  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (agency_id, policy_no, renewal_date)
);

CREATE INDEX IF NOT EXISTS renewal_events_agency_status_idx
  ON renewal_events (agency_id, status);

CREATE INDEX IF NOT EXISTS renewal_events_renewal_date_idx
  ON renewal_events (agency_id, renewal_date);

ALTER TABLE public.renewal_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage renewal_events"
  ON public.renewal_events FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ── renewal_uploads ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.renewal_uploads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filename      TEXT,
  rows_added    INT NOT NULL DEFAULT 0,
  rows_updated  INT NOT NULL DEFAULT 0,
  committed     BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE public.renewal_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can manage renewal_uploads"
  ON public.renewal_uploads FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ── Migrate pending_cancel_events.assigned_to → assigned_to_id ──────────────
-- Add new FK column alongside existing free-text column (keep both during transition)
ALTER TABLE pending_cancel_events
  ADD COLUMN IF NOT EXISTS assigned_to_id UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pending_cancel_events_assigned_idx
  ON pending_cancel_events (assigned_to_id);

-- Backfill: match existing free-text names to employees
-- (runs best-effort — unmatched rows stay NULL)
UPDATE pending_cancel_events pce
SET assigned_to_id = e.id
FROM employees e
WHERE e.org_id = pce.agency_id
  AND (
    lower(pce.assigned_to) = lower(concat_ws(' ', e.first_name, e.last_name))
    OR lower(pce.assigned_to) = lower(e.preferred_name)
  )
  AND pce.assigned_to_id IS NULL
  AND pce.assigned_to IS NOT NULL;

COMMENT ON COLUMN pending_cancel_events.assigned_to IS
  'Legacy free-text. Use assigned_to_id going forward.';
COMMENT ON COLUMN pending_cancel_events.assigned_to_id IS
  'FK to employees — enables retention scorecard attribution.';
