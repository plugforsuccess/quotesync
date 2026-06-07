-- ============================================================================
-- Reconcile: treat rewrites/transfers as RETAINED, not lost
-- ============================================================================
-- When a policy is rewritten or transferred to a NEW policy number ("Cancel/
-- Rewrite"), the OLD number cancels and drops out of the Policy Audit in-force
-- census. The previous reconcile_renewal_outcomes() saw the old number missing
-- (or pif_current = 0) and marked the renewal LOST — understating retention and
-- wrongly flagging a save-failure. Allstate's book-level Net Retention already
-- counts these as kept; this aligns the per-policy reconciliation with that.
--
-- The signal is authoritative: the cancelled old policy appears on the
-- Termination report and is auto-categorized 'rewritten' (the BEFORE INSERT
-- trigger runs categorize_termination_reason on every lapse_event, honoring
-- per-agency alias overrides). So:
--   * Update A — any past-due renewal whose policy has a 'rewritten' lapse is
--     marked RETAINED (confirmed / renewed), regardless of audit presence.
--   * Update B — the existing audit-based reconcile, but EXCLUDING rewritten
--     policies so a pif_current = 0 transfer is never flipped back to lost.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_renewal_outcomes(p_agency_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer := 0;
  _rows    integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM agency_memberships
    WHERE user_id = auth.uid() AND agency_id = p_agency_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'not authorized for this agency';
  END IF;

  -- Policies cancelled only to be rewritten/transferred to a new number.
  -- (Category is the source of truth — set on insert by the lapse trigger.)
  WITH rewritten AS (
    SELECT DISTINCT le.policy_no
    FROM lapse_events le
    JOIN termination_reason_categories c ON c.id = le.termination_category_id
    WHERE le.agency_id = p_agency_id
      AND c.code = 'rewritten'
  )
  -- Update A: rewrites are retained, regardless of audit presence.
  UPDATE renewal_cases rc
  SET status        = 'confirmed',
      final_outcome = 'renewed',
      final_outcome_set_at = now(),
      outcome_source = 'observed',
      resolution_date = COALESCE(rc.resolution_date, CURRENT_DATE),
      updated_at = now()
  FROM rewritten rw
  WHERE rc.agency_id = p_agency_id
    AND rc.policy_no = rw.policy_no
    AND rc.renewal_date < CURRENT_DATE
    AND rc.status <> 'confirmed';

  GET DIAGNOSTICS _rows = ROW_COUNT;
  _updated := _updated + _rows;

  -- Update B: observed audit reconcile, excluding rewrites (handled above).
  WITH latest_audit AS (
    SELECT DISTINCT ON (policy_no) policy_no, pif_current
    FROM policy_audit_snapshots
    WHERE agency_id = p_agency_id
    ORDER BY policy_no, production_month DESC
  ),
  rewritten AS (
    SELECT DISTINCT le.policy_no
    FROM lapse_events le
    JOIN termination_reason_categories c ON c.id = le.termination_category_id
    WHERE le.agency_id = p_agency_id
      AND c.code = 'rewritten'
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
    AND rc.policy_no NOT IN (SELECT policy_no FROM rewritten)
    AND (
      (la.pif_current = 1 AND rc.status <> 'confirmed')
      OR (la.pif_current = 0 AND rc.status <> 'lost')
    );

  GET DIAGNOSTICS _rows = ROW_COUNT;
  _updated := _updated + _rows;

  RETURN _updated;
END $$;

REVOKE EXECUTE ON FUNCTION public.reconcile_renewal_outcomes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_renewal_outcomes(uuid) TO authenticated;

COMMENT ON FUNCTION public.reconcile_renewal_outcomes(uuid) IS
  'Overrides inferred renewal outcomes with observed in-force status from the latest Policy Audit. Rewrites/transfers (lapse category ''rewritten'') are counted as retained, never lost. Run after a Policy Audit upload.';
