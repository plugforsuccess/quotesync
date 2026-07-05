-- ============================================================================
-- Re-enable "premium you quoted" capture + the report that reads it
-- ============================================================================
-- 20260702120000 turned captures_premium off for the re-quote-style tactics
-- because offered_premium "had no consumers" — the accepted quote is written to
-- saved_premium on the save path, so at-call entry felt like duplicate work.
-- But that dropped the field's one unique value: the quote on calls that end
-- LOST or undecided, where saved_premium is never written. That's the price
-- that failed to save the customer — the offer side of the elasticity dataset.
--
-- This migration closes the loop the 20260702 note asked for ("re-enable
-- per-tactic and build the report that reads it together"):
--   1. captures_premium back ON for requote_deductible / requote_coverage /
--      bundle / competitor_match.
--      company_transfer stays OFF — a transfer executes as the new renewal, so
--      the close screen's saved_premium IS the accepted quote (20260702110000's
--      rationale still holds for that tactic).
--   2. offer_outcomes view — every attempt that carries an offered premium or a
--      competitor quote, joined to its case's outcome and premium context.
--      Consumed by useOfferOutcomes / OfferOutcomesPanel (the Offers tab).
--
-- The duplicate-entry complaint is addressed in the app, not by dropping data:
-- the close screen now pre-fills the saved premium from the latest at-call
-- quote, so on the save path the rep types the number ONCE (at the call).

-- ── 1. Turn the prompt back on ───────────────────────────────────────────────
UPDATE public.intervention_types
SET captures_premium = true
WHERE code IN ('requote_deductible', 'requote_coverage', 'bundle', 'competitor_match');

-- ── 2. offer_outcomes — the consumer ─────────────────────────────────────────
-- One row per attempt with offer evidence (offered_premium or competitor_quote).
-- Outcome labels follow the established precedents exactly:
--   renewal: renewal_elasticity_curve (final_outcome first, status fallback,
--            unreachable counted lost per useRetentionLift)
--   cancel:  intervention_effectiveness (saved/rewritten vs lost buckets;
--            auto_resolved stays open — resolved without a rep save)
-- security_invoker so per-agency RLS on the underlying tables still applies.
CREATE OR REPLACE VIEW public.offer_outcomes
WITH (security_invoker = true) AS
SELECT
  ra.agency_id,
  'renewal'                 AS case_type,
  rc.id                     AS case_id,
  ra.id                     AS attempt_id,
  ra.attempted_at,
  ra.employee_id,
  COALESCE(e.preferred_name, NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), '')) AS rep_name,
  ra.interventions,
  ra.offered_premium,
  ra.competitor_name,
  ra.competitor_quote,
  ra.discount_note,
  rc.customer_name,
  rc.policy_no,
  rc.product,
  rc.premium                AS case_premium,          -- the renewal offer on the table
  rc.premium_change_pct,
  rc.saved_premium,
  CASE
    WHEN rc.final_outcome = 'renewed' THEN 'saved'
    WHEN rc.final_outcome = 'lost'    THEN 'lost'
    WHEN rc.final_outcome IS NULL AND rc.status IN ('confirmed', 'auto_resolved') THEN 'saved'
    WHEN rc.final_outcome IS NULL AND rc.status IN ('lost', 'unreachable')        THEN 'lost'
    ELSE 'open'
  END AS outcome
FROM public.renewal_attempts ra
JOIN public.renewal_cases rc ON rc.id = ra.renewal_case_id
LEFT JOIN public.employees e ON e.id = ra.employee_id
WHERE ra.offered_premium IS NOT NULL OR ra.competitor_quote IS NOT NULL

UNION ALL

SELECT
  pa.agency_id,
  'cancel'                  AS case_type,
  pc.id                     AS case_id,
  pa.id                     AS attempt_id,
  pa.attempted_at,
  pa.employee_id,
  COALESCE(e.preferred_name, NULLIF(TRIM(COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '')), '')) AS rep_name,
  pa.interventions,
  pa.offered_premium,
  pa.competitor_name,
  pa.competitor_quote,
  pa.discount_note,
  pc.customer_name,
  pc.policy_no,
  pc.product,
  pc.premium_at_risk        AS case_premium,          -- the premium walking out the door
  NULL::numeric             AS premium_change_pct,
  pc.saved_premium,
  CASE
    WHEN pc.status IN ('saved', 'rewritten')                          THEN 'saved'
    WHEN pc.status IN ('lost', 'requested_cancellation', 'cancelled') THEN 'lost'
    ELSE 'open'
  END AS outcome
FROM public.pending_cancel_attempts pa
JOIN public.pending_cases pc ON pc.id = pa.pending_case_id
LEFT JOIN public.employees e ON e.id = pa.employee_id
WHERE pa.offered_premium IS NOT NULL OR pa.competitor_quote IS NOT NULL;

GRANT SELECT ON public.offer_outcomes TO authenticated;

COMMENT ON VIEW public.offer_outcomes IS
  'Every call attempt carrying an offered premium or competitor quote, joined to the case outcome. The lost rows are the quotes that failed to save the customer — the offer side of the retention-elasticity dataset.';

NOTIFY pgrst, 'reload schema';
