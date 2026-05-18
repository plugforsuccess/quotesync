-- ============================================================================
-- Termination Reason Taxonomy
-- ============================================================================
-- Three things:
--   1. termination_reason_categories — fixed canonical taxonomy (10 rows seeded)
--   2. termination_reason_aliases    — per-agency raw → category mappings
--   3. ALTER lapse_events ADD termination_category_id FK
-- ============================================================================

-- ─── 1. termination_reason_categories ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.termination_reason_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  description   TEXT,
  -- Actionability: can the agency intervene? 'preventable', 'partial', 'external'
  action_class  TEXT NOT NULL CHECK (action_class IN ('preventable', 'partial', 'external')),
  -- Display color (uses chart palette tokens)
  color_token   TEXT NOT NULL DEFAULT '#94A3B8',
  sort_order    INTEGER NOT NULL DEFAULT 99,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.termination_reason_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "termination_categories_select_all_authenticated" ON public.termination_reason_categories;
CREATE POLICY "termination_categories_select_all_authenticated" ON public.termination_reason_categories
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed the 10 canonical categories
INSERT INTO public.termination_reason_categories
  (code, display_name, description, action_class, color_token, sort_order)
VALUES
  ('price',          'Price',                'Customer found lower premium elsewhere. Preventable through rate review and proactive remarketing.',
   'preventable', '#EF4444', 1),
  ('non_payment',    'Non-Payment',          'Cancellation for non-payment of premium. Preventable through follow-up cadence and EFT setup.',
   'preventable', '#F97316', 2),
  ('switched',       'Switched Carriers',    'Insured moved to a competitor. Preventable through retention outreach if reached before bind.',
   'preventable', '#F59E0B', 3),
  ('service',        'Service Issue',        'Customer dissatisfied with service or claims handling. Preventable through service excellence and complaint resolution.',
   'preventable', '#EAB308', 4),
  ('underwriting',   'Underwriting Action',  'Carrier non-renewal due to risk profile (driving record, claims, property condition). External to agency.',
   'external', '#8B5CF6', 5),
  ('moved',          'Customer Moved',       'Insured relocated outside writing territory. Partial — may be retainable in some carrier networks.',
   'partial', '#06B6D4', 6),
  ('life_event',     'Life Event',           'Marriage, divorce, death, no longer has insurable interest. Mostly external.',
   'external', '#84CC16', 7),
  ('rewritten',      'Rewritten Internally', 'Policy rewritten to another product/carrier within agency. Not lost revenue.',
   'partial', '#10B981', 8),
  ('agency_request', 'Agency Request',       'Agency-initiated termination (uninsurable, fraud, complaint). Intentional.',
   'partial', '#3B82F6', 9),
  ('other',          'Other / Uncategorized', 'Reason did not match any category. Needs review.',
   'external', '#94A3B8', 99)
ON CONFLICT (code) DO NOTHING;

-- ─── 2. termination_reason_aliases ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.termination_reason_aliases (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id      UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  raw_reason     TEXT NOT NULL,
  category_code  TEXT NOT NULL REFERENCES public.termination_reason_categories(code) ON DELETE RESTRICT,
  -- Was this alias added by the user, by the auto-categorizer, or by global seed?
  source         TEXT NOT NULL DEFAULT 'user'
                 CHECK (source IN ('user', 'auto', 'global_seed')),
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT termination_aliases_unique UNIQUE (agency_id, raw_reason)
);

CREATE INDEX IF NOT EXISTS idx_termination_aliases_lookup
  ON public.termination_reason_aliases (agency_id, raw_reason);

ALTER TABLE public.termination_reason_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "termination_aliases_select" ON public.termination_reason_aliases;
CREATE POLICY "termination_aliases_select" ON public.termination_reason_aliases
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "termination_aliases_insert_principal" ON public.termination_reason_aliases;
CREATE POLICY "termination_aliases_insert_principal" ON public.termination_reason_aliases
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = termination_reason_aliases.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

DROP POLICY IF EXISTS "termination_aliases_update_principal" ON public.termination_reason_aliases;
CREATE POLICY "termination_aliases_update_principal" ON public.termination_reason_aliases
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = termination_reason_aliases.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "termination_aliases_delete_principal" ON public.termination_reason_aliases;
CREATE POLICY "termination_aliases_delete_principal" ON public.termination_reason_aliases
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = termination_reason_aliases.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

-- ─── 3. Add termination_category_id to lapse_events ──────────────────────────

ALTER TABLE public.lapse_events
  ADD COLUMN IF NOT EXISTS termination_category_id UUID
  REFERENCES public.termination_reason_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lapse_events_category
  ON public.lapse_events (agency_id, termination_category_id);

-- ─── 4. Helper function: categorize_termination_reason ───────────────────────
-- Given a raw reason string + agency, return the category_id by:
--   1. Looking for exact alias match in termination_reason_aliases
--   2. Applying built-in heuristic on the raw text
--   3. Defaulting to 'other'
-- Used by both the post-import trigger and the manual recategorization UI.

CREATE OR REPLACE FUNCTION public.categorize_termination_reason(
  p_agency_id UUID,
  p_raw_reason TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _category_id UUID;
  _normalized TEXT;
BEGIN
  IF p_raw_reason IS NULL OR trim(p_raw_reason) = '' THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'other';
    RETURN _category_id;
  END IF;

  _normalized := lower(trim(p_raw_reason));

  -- Step 1: exact alias match
  SELECT c.id INTO _category_id
  FROM termination_reason_aliases a
  JOIN termination_reason_categories c ON c.code = a.category_code
  WHERE a.agency_id = p_agency_id
    AND lower(a.raw_reason) = _normalized
  LIMIT 1;

  IF _category_id IS NOT NULL THEN
    RETURN _category_id;
  END IF;

  -- Step 2: built-in heuristic
  IF _normalized LIKE '%non%pay%' OR _normalized LIKE '%nonpay%' OR _normalized LIKE '%nsf%'
     OR _normalized LIKE '%premium not paid%' OR _normalized LIKE '%payment%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'non_payment';
  ELSIF _normalized LIKE '%price%' OR _normalized LIKE '%rate%' OR _normalized LIKE '%cost%'
        OR _normalized LIKE '%premium too high%' OR _normalized LIKE '%too expensive%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'price';
  ELSIF _normalized LIKE '%switched%' OR _normalized LIKE '%different company%'
        OR _normalized LIKE '%moved to%' OR _normalized LIKE '%new carrier%'
        OR _normalized LIKE '%competitor%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'switched';
  ELSIF _normalized LIKE '%service%' OR _normalized LIKE '%claim%' OR _normalized LIKE '%complaint%'
        OR _normalized LIKE '%dissatisf%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'service';
  ELSIF _normalized LIKE '%underwrit%' OR _normalized LIKE '%non%renew%' OR _normalized LIKE '%nonrenew%'
        OR _normalized LIKE '%mvr%' OR _normalized LIKE '%loss history%' OR _normalized LIKE '%risk%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'underwriting';
  ELSIF _normalized LIKE '%moved%' OR _normalized LIKE '%relocat%' OR _normalized LIKE '%out of state%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'moved';
  ELSIF _normalized LIKE '%marri%' OR _normalized LIKE '%divorce%' OR _normalized LIKE '%deceased%'
        OR _normalized LIKE '%death%' OR _normalized LIKE '%no longer%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'life_event';
  ELSIF _normalized LIKE '%rewrit%' OR _normalized LIKE '%re-writ%' OR _normalized LIKE '%internal%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'rewritten';
  ELSIF _normalized LIKE '%agency%request%' OR _normalized LIKE '%fraud%'
  THEN
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'agency_request';
  ELSE
    SELECT id INTO _category_id FROM termination_reason_categories WHERE code = 'other';
  END IF;

  RETURN _category_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.categorize_termination_reason(UUID, TEXT) TO authenticated;
