-- ============================================================================
-- Weekly Operating Review — supporting tables
-- ============================================================================
-- Tracks principal interactions with the Weekly Operating Review surface:
--   1. operating_review_dismissed_slips — principal said "yes I know about
--      this slip and I don't want it surfacing again this week"
--   2. operating_review_completions — historical record of "I reviewed
--      week X" for streak counting and back-fill
-- ============================================================================

-- ─── 1. operating_review_dismissed_slips ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operating_review_dismissed_slips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- The week being reviewed (Monday, YYYY-MM-DD)
  review_week     DATE NOT NULL,

  -- The slip type — one of the slip categories defined in the spec
  slip_type       TEXT NOT NULL CHECK (slip_type IN (
    'pending_cancel_unresolved',
    'producer_target_miss',
    'renewal_slippage',
    'lead_response_delay',
    'upload_delay'
  )),

  -- Optional reference to the specific row that was dismissed
  -- (e.g., pending_case.id for a pending_cancel_unresolved slip).
  -- Free-form text to keep flexibility across slip types.
  slip_ref        TEXT,

  -- Principal who dismissed it
  dismissed_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional reason
  note            TEXT,

  -- Prevent the same slip from being dismissed twice for the same week
  CONSTRAINT dismissed_slips_unique UNIQUE (agency_id, review_week, slip_type, slip_ref)
);

CREATE INDEX IF NOT EXISTS idx_dismissed_slips_lookup
  ON public.operating_review_dismissed_slips (agency_id, review_week);

ALTER TABLE public.operating_review_dismissed_slips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dismissed_slips_select" ON public.operating_review_dismissed_slips;
CREATE POLICY "dismissed_slips_select" ON public.operating_review_dismissed_slips
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "dismissed_slips_insert_principal" ON public.operating_review_dismissed_slips;
CREATE POLICY "dismissed_slips_insert_principal" ON public.operating_review_dismissed_slips
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = operating_review_dismissed_slips.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

DROP POLICY IF EXISTS "dismissed_slips_delete_principal" ON public.operating_review_dismissed_slips;
CREATE POLICY "dismissed_slips_delete_principal" ON public.operating_review_dismissed_slips
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = operating_review_dismissed_slips.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

-- ─── 2. operating_review_completions ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.operating_review_completions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- The week that was reviewed (Monday, YYYY-MM-DD)
  review_week     DATE NOT NULL,

  -- Principal who marked it reviewed
  completed_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Optional principal note ("I focused on X this week")
  note            TEXT,

  -- One completion per agency per week
  CONSTRAINT completions_unique UNIQUE (agency_id, review_week)
);

CREATE INDEX IF NOT EXISTS idx_completions_lookup
  ON public.operating_review_completions (agency_id, review_week DESC);

ALTER TABLE public.operating_review_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "completions_select" ON public.operating_review_completions;
CREATE POLICY "completions_select" ON public.operating_review_completions
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "completions_insert_principal" ON public.operating_review_completions;
CREATE POLICY "completions_insert_principal" ON public.operating_review_completions
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = operating_review_completions.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

-- No UPDATE policy — completions are immutable. Re-completing creates a new row via UPSERT.
-- No DELETE policy — completions are historical record.
