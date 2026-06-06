-- ============================================================================
-- Collapse dual-status tech debt: `status` is the canonical workflow column
-- ============================================================================
-- renewal_cases has two status-like columns:
--   * status         — the QuoteSync workflow status (pending/confirmed/lost/…). CANONICAL.
--   * renewal_status — the RAW Allstate "Renewal Status" report field (e.g.
--                      "Renewal Not Taken"), set only at import and used by the
--                      import diff. NOT a workflow field.
-- App code that mistakenly wrote/read renewal_status as the workflow status has
-- been redirected to `status`. This migration removes the same confusion from
-- the reconcile function and the effectiveness view so they rely only on the
-- canonical status + final_outcome.
-- ============================================================================

-- Reconcile: write only the canonical status (+ final_outcome), not the import field.
CREATE OR REPLACE FUNCTION public.reconcile_renewal_outcomes(p_agency_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agency_memberships
    WHERE user_id = auth.uid() AND agency_id = p_agency_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not authorized for this agency';
  END IF;

  WITH latest_audit AS (
    SELECT DISTINCT ON (policy_no) policy_no, pif_current
    FROM policy_audit_snapshots
    WHERE agency_id = p_agency_id
    ORDER BY policy_no, production_month DESC
  )
  UPDATE renewal_cases rc
  SET status        = CASE WHEN la.pif_current = 1 THEN 'confirmed' ELSE 'lost' END,
      final_outcome = CASE WHEN la.pif_current = 1 THEN 'renewed'   ELSE 'lost' END,
      final_outcome_set_at = now(),
      outcome_source = 'observed',
      resolution_date = COALESCE(rc.resolution_date, CURRENT_DATE),
      updated_at = now()
  FROM latest_audit la
  WHERE rc.agency_id = p_agency_id
    AND rc.policy_no = la.policy_no
    AND rc.renewal_date < CURRENT_DATE
    AND (
      (la.pif_current = 1 AND rc.status <> 'confirmed')
      OR (la.pif_current = 0 AND rc.status <> 'lost')
    );

  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated;
END $$;

REVOKE EXECUTE ON FUNCTION public.reconcile_renewal_outcomes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_renewal_outcomes(uuid) TO authenticated;

-- Effectiveness: judge save/loss by the canonical status + final_outcome only
-- (the old renewal_status='renewed' clause referenced the raw import field).
CREATE OR REPLACE VIEW public.intervention_effectiveness AS
WITH touched AS (
  SELECT ra.agency_id,
         unnest(ra.interventions) AS tactic,
         CASE
           WHEN rc.status = 'confirmed' OR rc.final_outcome = 'renewed' THEN 1
           WHEN rc.status = 'lost' OR rc.final_outcome = 'lost' THEN 0
           ELSE NULL
         END AS saved
  FROM public.renewal_attempts ra
  JOIN public.renewal_cases rc ON rc.id = ra.renewal_case_id
  WHERE ra.interventions IS NOT NULL

  UNION ALL

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
  agency_id, tactic,
  count(*)                                  AS used,
  count(*) FILTER (WHERE saved IS NOT NULL) AS resolved,
  count(*) FILTER (WHERE saved = 1)         AS saved
FROM touched
GROUP BY agency_id, tactic;

GRANT SELECT ON public.intervention_effectiveness TO authenticated;

COMMENT ON COLUMN public.renewal_cases.renewal_status IS
  'Raw Allstate "Renewal Status" report field (set at import; used by the import diff). NOT the workflow status — use renewal_cases.status for that.';
