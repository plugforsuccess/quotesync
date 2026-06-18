-- ============================================================================
-- Intervention Capture
-- ============================================================================
-- Records WHAT the agent did to save a customer — the save tactic — not just
-- that a call happened. This is the one retention input no Allstate report can
-- ever provide; it only exists if captured at the moment of the call.
--
-- Three things:
--   1. intervention_types — global canonical taxonomy of save tactics (seeded)
--   2. ALTER renewal_attempts        ADD intervention columns
--   3. ALTER pending_cancel_attempts ADD intervention columns
--
-- Grain: one intervention record per call attempt (the attempt is the natural
-- unit — a save can take several touches, each with its own tactic). Later the
-- elasticity join reads these against renewal premium change + observed outcome
-- to answer "which interventions actually save customers, at which rate band."
-- ============================================================================

-- ─── 1. intervention_types ───────────────────────────────────────────────────
-- Mirrors the termination_reason_categories pattern: a global seeded lookup,
-- readable by any authenticated user. Two capture flags tell the UI when to
-- prompt for the extra structured fields (offered premium / competitor quote).

CREATE TABLE IF NOT EXISTS public.intervention_types (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT NOT NULL UNIQUE,
  display_name        TEXT NOT NULL,
  description         TEXT,
  -- When true, the UI prompts for offered_premium (re-quote style tactics).
  captures_premium    BOOLEAN NOT NULL DEFAULT false,
  -- When true, the UI prompts for competitor_name + competitor_quote.
  captures_competitor BOOLEAN NOT NULL DEFAULT false,
  sort_order          INTEGER NOT NULL DEFAULT 99,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.intervention_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "intervention_types_select_all_authenticated" ON public.intervention_types;
CREATE POLICY "intervention_types_select_all_authenticated" ON public.intervention_types
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Seed the canonical save tactics.
INSERT INTO public.intervention_types
  (code, display_name, description, captures_premium, captures_competitor, sort_order)
VALUES
  ('requote_deductible', 'Re-quote: raised deductible',  'Lowered premium by raising the deductible.',                 true,  false, 1),
  ('requote_coverage',   'Re-quote: adjusted coverage',  'Adjusted coverage/limits to bring the premium down.',         true,  false, 2),
  ('bundle',             'Bundled policies',             'Added a line (auto+home etc.) for a multi-policy discount.',  true,  false, 3),
  ('discount',           'Applied discount',             'Applied a discount (safe driver, paperless, autopay, etc.).', false, false, 4),
  ('competitor_match',   'Matched competitor quote',     'Matched or beat a quote the customer got elsewhere.',         true,  true,  5),
  ('payment_plan',       'Payment plan / EFT setup',     'Set up a payment arrangement or EFT to cure non-payment.',    false, false, 6),
  ('explained_increase', 'Explained rate increase',      'Explained the increase / retained on the relationship.',      false, false, 7),
  ('escalated',          'Escalated to principal',       'Handed off to the principal/agent for a retention decision.', false, false, 8),
  ('other',              'Other',                        'Tactic not covered by the list above.',                       false, false, 99)
ON CONFLICT (code) DO NOTHING;

-- ─── 2 & 3. Intervention columns on the two attempt tables ───────────────────
-- interventions      = array of intervention_types.code applied on this attempt
--                      (loosely coupled — arrays can't FK; the lookup is the
--                      documented source, same as termination_reason_aliases).
-- offered_premium    = the premium quoted to the customer on this attempt ($).
-- competitor_name    = the carrier the customer is shopping / quoted by.
-- competitor_quote   = the competitor's quoted premium ($), when known.
-- discount_note      = free-text detail on the discount/tactic.

ALTER TABLE public.renewal_attempts
  ADD COLUMN IF NOT EXISTS interventions    TEXT[],
  ADD COLUMN IF NOT EXISTS offered_premium  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS competitor_name  TEXT,
  ADD COLUMN IF NOT EXISTS competitor_quote NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_note    TEXT;

ALTER TABLE public.pending_cancel_attempts
  ADD COLUMN IF NOT EXISTS interventions    TEXT[],
  ADD COLUMN IF NOT EXISTS offered_premium  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS competitor_name  TEXT,
  ADD COLUMN IF NOT EXISTS competitor_quote NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS discount_note    TEXT;

-- GIN indexes so the elasticity analytics can filter "attempts where a given
-- tactic was used" efficiently across the book.
CREATE INDEX IF NOT EXISTS renewal_attempts_interventions_idx
  ON public.renewal_attempts USING GIN (interventions);
CREATE INDEX IF NOT EXISTS pending_cancel_attempts_interventions_idx
  ON public.pending_cancel_attempts USING GIN (interventions);

COMMENT ON COLUMN public.renewal_attempts.interventions IS
  'Save tactics applied on this attempt (intervention_types.code[]). The intervention layer — joins to premium change + outcome to build the retention-elasticity model.';
COMMENT ON COLUMN public.pending_cancel_attempts.interventions IS
  'Save tactics applied on this attempt (intervention_types.code[]).';
