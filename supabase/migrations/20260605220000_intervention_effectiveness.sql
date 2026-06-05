-- ============================================================================
-- Intervention effectiveness — "which save tactics actually work"
-- ============================================================================
-- Unnests the interventions[] captured on each call attempt and joins to the
-- case's outcome, so we can compute a per-tactic save rate. This is the moat:
-- it turns the captured tactics into "deductible re-quote saves X%, explaining
-- the increase saves Y%." Powers the learned save-lift (replacing the prior)
-- and the "what's working" panel. Empty until enough tactics are captured.
-- ============================================================================

CREATE OR REPLACE VIEW public.intervention_effectiveness AS
WITH touched AS (
  -- Renewal save attempts → renewal case outcome
  SELECT ra.agency_id,
         unnest(ra.interventions) AS tactic,
         CASE
           WHEN rc.status IN ('confirmed') OR rc.renewal_status = 'renewed' OR rc.final_outcome = 'renewed' THEN 1
           WHEN rc.status = 'lost' OR rc.renewal_status = 'lost' OR rc.final_outcome = 'lost' THEN 0
           ELSE NULL
         END AS saved
  FROM public.renewal_attempts ra
  JOIN public.renewal_cases rc ON rc.id = ra.renewal_case_id
  WHERE ra.interventions IS NOT NULL

  UNION ALL

  -- Pending-cancel save attempts → pending case outcome
  SELECT pa.agency_id,
         unnest(pa.interventions) AS tactic,
         CASE
           WHEN pc.status = 'saved' THEN 1
           WHEN pc.status IN ('lost', 'requested_cancellation', 'cancelled') THEN 0
           ELSE NULL
         END AS saved
  FROM public.pending_cancel_attempts pa
  JOIN public.pending_cases pc ON pc.id = pa.pending_case_id
  WHERE pa.interventions IS NOT NULL
)
SELECT
  agency_id,
  tactic,
  count(*)                                  AS used,
  count(*) FILTER (WHERE saved IS NOT NULL) AS resolved,
  count(*) FILTER (WHERE saved = 1)         AS saved
FROM touched
GROUP BY agency_id, tactic;

GRANT SELECT ON public.intervention_effectiveness TO authenticated;

COMMENT ON VIEW public.intervention_effectiveness IS
  'Per-tactic save counts (used / resolved / saved) from captured interventions joined to case outcomes. Save rate = saved / resolved. Foundation of the learned per-tactic save-lift.';
