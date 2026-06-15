-- ============================================================================
-- auto_resolve_stale_renewals: label outcomes + honor rewrites (PR-2 close)
-- ============================================================================
-- The daily cron that closes stale renewals previously wrote only `status`,
-- leaving the elasticity-grade columns (final_outcome, outcome_source) NULL —
-- so the bulk of post-launch renewals would resolve unlabeled. It was also a
-- duplicate of the import cross-reference and still carried the rewrite bug:
-- it marked ANY policy on the Termination report as LOST, including Cancel/
-- Rewrite transfers (which are RETAINED on a new policy number).
--
-- This version mirrors reconcile_renewal_outcomes() and the import fix:
--   * rewrites/transfers (lapse category 'rewritten') -> retained, never lost
--   * every close stamps final_outcome + outcome_source ('observed' when
--     confirmed on a report, 'inferred' when assumed from easy-pay/age)
--   * retained pending outcomes ('saved','rewritten') no longer count as
--     "still in the cancel cycle"
-- Rep-set outcomes are untouched (terminal statuses are excluded by the guard).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_resolve_stale_renewals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- 0) Rewrites/transfers: the cancelled old policy reappears on the Termination
  --    report categorized 'rewritten' = customer RETAINED on a new policy number.
  UPDATE public.renewal_cases rc
  SET status = 'confirmed',
      final_outcome = 'renewed',
      outcome_source = 'observed',
      final_outcome_set_at = now(),
      resolution_date = COALESCE(rc.resolution_date, CURRENT_DATE)
  WHERE rc.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND rc.renewal_date < CURRENT_DATE
    AND rc.policy_no IN (
      SELECT le.policy_no FROM public.lapse_events le
      JOIN public.termination_reason_categories c ON c.id = le.termination_category_id
      WHERE le.agency_id = rc.agency_id AND c.code = 'rewritten'
    );

  -- 1) LOST: past-due renewals now on an active pending cancel (didn't renew).
  UPDATE public.renewal_cases rc
  SET status = 'lost', final_outcome = 'lost', outcome_source = 'observed',
      final_outcome_set_at = now(), resolution_date = CURRENT_DATE
  WHERE rc.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND rc.renewal_date < CURRENT_DATE
    AND rc.policy_no IN (
      SELECT pc.policy_no FROM public.pending_cases pc
      WHERE pc.agency_id = rc.agency_id
        AND pc.status NOT IN ('saved','rewritten','lost','auto_resolved','cancelled','requested_cancellation')
    );

  -- 2) LOST: past-due renewals on the Termination report — EXCLUDING rewrites.
  UPDATE public.renewal_cases rc
  SET status = 'lost', final_outcome = 'lost', outcome_source = 'observed',
      final_outcome_set_at = now(), resolution_date = CURRENT_DATE
  WHERE rc.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND rc.renewal_date < CURRENT_DATE
    AND rc.policy_no IN (
      SELECT le.policy_no FROM public.lapse_events le WHERE le.agency_id = rc.agency_id
    )
    AND rc.policy_no NOT IN (
      SELECT le.policy_no FROM public.lapse_events le
      JOIN public.termination_reason_categories c ON c.id = le.termination_category_id
      WHERE le.agency_id = rc.agency_id AND c.code = 'rewritten'
    );

  -- 3) AUTO-RESOLVE (renewed, inferred): EasyPay 10+ days past, on no report.
  UPDATE public.renewal_cases rc
  SET status = 'auto_resolved', final_outcome = 'renewed', outcome_source = 'inferred',
      final_outcome_set_at = now(), resolution_date = CURRENT_DATE
  WHERE rc.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND rc.easy_pay = true
    AND rc.renewal_date < CURRENT_DATE - INTERVAL '10 days'
    AND rc.policy_no NOT IN (
      SELECT le.policy_no FROM public.lapse_events le WHERE le.agency_id = rc.agency_id
    )
    AND rc.policy_no NOT IN (
      SELECT pc.policy_no FROM public.pending_cases pc
      WHERE pc.agency_id = rc.agency_id
        AND pc.status NOT IN ('saved','rewritten','lost','auto_resolved','cancelled','requested_cancellation')
    );

  -- 4) AUTO-RESOLVE (renewed, inferred): non-EasyPay 30+ days past, on no report.
  UPDATE public.renewal_cases rc
  SET status = 'auto_resolved', final_outcome = 'renewed', outcome_source = 'inferred',
      final_outcome_set_at = now(), resolution_date = CURRENT_DATE
  WHERE rc.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND rc.easy_pay = false
    AND rc.renewal_date < CURRENT_DATE - INTERVAL '30 days'
    AND rc.policy_no NOT IN (
      SELECT le.policy_no FROM public.lapse_events le WHERE le.agency_id = rc.agency_id
    )
    AND rc.policy_no NOT IN (
      SELECT pc.policy_no FROM public.pending_cases pc
      WHERE pc.agency_id = rc.agency_id
        AND pc.status NOT IN ('saved','rewritten','lost','auto_resolved','cancelled','requested_cancellation')
    );
END;
$function$;
