-- ============================================================================
-- Reconcile renewal outcomes against the OBSERVED Policy Audit census
-- ============================================================================
-- Replaces the inferred easy_pay outcome with the observed truth: if a policy
-- is in force in the latest Policy Audit snapshot it RENEWED; if it dropped, it
-- was LOST. Run after each Policy Audit upload. Past-due renewals only (the
-- outcome window has closed). Per-agency membership guard (SECURITY DEFINER).
-- ============================================================================

ALTER TABLE public.renewal_cases
  ADD COLUMN IF NOT EXISTS outcome_source TEXT;  -- 'inferred' | 'observed' | 'rep'

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
  SET status         = CASE WHEN la.pif_current = 1 THEN 'confirmed' ELSE 'lost' END,
      renewal_status = CASE WHEN la.pif_current = 1 THEN 'renewed'   ELSE 'lost' END,
      final_outcome  = CASE WHEN la.pif_current = 1 THEN 'renewed'   ELSE 'lost' END,
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

COMMENT ON FUNCTION public.reconcile_renewal_outcomes(uuid) IS
  'Overrides inferred renewal outcomes with the observed in-force status from the latest Policy Audit snapshot. Run after a Policy Audit upload.';
