-- ============================================================================
-- Automated monthly retention-bonus close
-- ============================================================================
-- Ports the client-side useRetentionCallVerification logic into a SQL function
-- so a closed month can be frozen into retention_bonus_ledger hands-off, without
-- anyone logged in. Scheduled via pg_cron, exactly like run_monthly_referral_draws.
--
-- Parity with the on-screen "Estimated" figure is intentional: same digits-only
-- phone normalization, same call_date month window, same ±2-hour match — so the
-- frozen amount equals what the principal/employee saw before the close.
--
-- Safety: the upsert only overwrites rows still in 'draft'/'finalized'. A row a
-- principal has marked 'paid' (or 'void') is left untouched, so a later auto-run
-- never disturbs a payout that's already been actioned.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_monthly_bonus_close(p_period_month date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Default to the previous calendar month when no period is passed.
  v_period      date := COALESCE(
    date_trunc('month', p_period_month)::date,
    (date_trunc('month', current_date) - interval '1 month')::date
  );
  v_next        date := (v_period + interval '1 month')::date;
  -- Attempt window in UTC, mirroring the client's `...T00:00:00Z` boundaries.
  v_month_start timestamptz := (v_period::text || ' 00:00:00+00')::timestamptz;
  v_month_end   timestamptz := (v_next::text   || ' 00:00:00+00')::timestamptz; -- exclusive
  v_rows        integer := 0;
  v_plan        record;
  v_verified    integer;
  v_payable     integer;
  v_amount      numeric(10,2);
BEGIN
  FOR v_plan IN
    SELECT p.agency_id, p.employee_id, p.bonus_unit,
           p.threshold, p.per_unit_amount, e.auth_user_id
    FROM public.employee_bonus_plans p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.enabled = true
      AND e.auth_user_id IS NOT NULL
  LOOP
    -- Verified = 'reached' phone attempts (cancel + renewal) this month that have
    -- a matching outbound Connected/Answered RC call to the same number within ±2h.
    WITH attempts AS (
      SELECT a.attempted_at,
             regexp_replace(coalesce(pc.phone, ''), '[^0-9]', '', 'g') AS norm_phone
      FROM public.pending_cancel_attempts a
      JOIN public.pending_cases pc ON pc.id = a.pending_case_id
      WHERE a.employee_id = v_plan.employee_id
        AND a.result = 'reached'
        AND a.method = 'phone'
        AND a.attempted_at >= v_month_start
        AND a.attempted_at <  v_month_end
      UNION ALL
      SELECT a.attempted_at,
             regexp_replace(coalesce(rc.phone, ''), '[^0-9]', '', 'g') AS norm_phone
      FROM public.renewal_attempts a
      JOIN public.renewal_cases rc ON rc.id = a.renewal_case_id
      WHERE a.employee_id = v_plan.employee_id
        AND a.result = 'reached'
        AND a.method = 'phone'
        AND a.attempted_at >= v_month_start
        AND a.attempted_at <  v_month_end
    ),
    calls AS (
      SELECT regexp_replace(coalesce(to_number, ''), '[^0-9]', '', 'g') AS norm_to,
             call_start_time
      FROM public.rc_call_log
      WHERE org_id = v_plan.agency_id
        AND employee_user_id = v_plan.auth_user_id
        AND call_direction = 'Outbound'
        AND call_result IN ('Connected', 'Answered')
        AND call_date >= v_period
        AND call_date <  v_next
    )
    SELECT count(*) INTO v_verified
    FROM attempts at
    WHERE length(at.norm_phone) >= 10
      AND EXISTS (
        SELECT 1 FROM calls c
        WHERE length(c.norm_to) >= 10
          AND c.norm_to = at.norm_phone
          AND abs(extract(epoch FROM (c.call_start_time - at.attempted_at))) <= 7200
      );

    v_payable := GREATEST(0, v_verified - v_plan.threshold);
    v_amount  := v_payable * v_plan.per_unit_amount;

    INSERT INTO public.retention_bonus_ledger (
      agency_id, employee_id, period_month, bonus_unit, threshold, per_unit_amount,
      verified_count, payable_units, bonus_amount, status, computed_at, computed_by, detail
    ) VALUES (
      v_plan.agency_id, v_plan.employee_id, v_period, v_plan.bonus_unit,
      v_plan.threshold, v_plan.per_unit_amount,
      v_verified, v_payable, v_amount, 'finalized', now(), NULL,
      jsonb_build_object('source', 'auto_monthly_close')
    )
    ON CONFLICT (agency_id, employee_id, period_month) DO UPDATE
      SET bonus_unit      = EXCLUDED.bonus_unit,
          threshold       = EXCLUDED.threshold,
          per_unit_amount = EXCLUDED.per_unit_amount,
          verified_count  = EXCLUDED.verified_count,
          payable_units   = EXCLUDED.payable_units,
          bonus_amount    = EXCLUDED.bonus_amount,
          status          = 'finalized',
          computed_at     = now(),
          detail          = EXCLUDED.detail
      WHERE public.retention_bonus_ledger.status IN ('draft', 'finalized');

    v_rows := v_rows + 1;
  END LOOP;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.run_monthly_bonus_close(date) IS
  'Freezes a month (default: previous) into retention_bonus_ledger for every enabled employee_bonus_plan. Mirrors the client verification. Never overwrites paid/void rows. Returns the number of plans processed.';

-- ─── Schedule: 07:00 on the 5th of each month (buffer for prior-month RC upload).
-- Re-running is safe (paid/void rows are preserved), so the few-day delay just
-- lets the RingCentral export for the closed month land first.
SELECT cron.unschedule('bonus-monthly-close')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bonus-monthly-close');

SELECT cron.schedule(
  'bonus-monthly-close',
  '0 7 5 * *',
  $$ SELECT public.run_monthly_bonus_close(); $$
);

-- ============================================================================
-- ROLLBACK (reference only; do not execute as part of this migration)
-- ============================================================================
-- SELECT cron.unschedule('bonus-monthly-close');
-- DROP FUNCTION IF EXISTS public.run_monthly_bonus_close(date);
