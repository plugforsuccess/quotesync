-- ============================================================================
-- Bonus verification hardening (anti-gaming)
-- ============================================================================
-- The retention bonus credits a "reached" call only when it matches a real
-- RingCentral outbound connected call within 2h. Two gaming holes remained:
--   * Trivial calls — a 1-second dial counts. Now the matched call must last
--     at least 60s (a real conversation), via rc_call_log.call_length_seconds.
--   * Repeat-dial farming — calling the same customer many times multiplied
--     credit. Now credit is per UNIQUE customer reached (count DISTINCT phone).
-- Everything else (the RingCentral cross-check, the 2h window, agency/employee
-- scoping) is unchanged. MIN_CALL_SECONDS is the only tunable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_monthly_bonus_close(p_period_month date DEFAULT NULL::date)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period      date := COALESCE(
    date_trunc('month', p_period_month)::date,
    (date_trunc('month', current_date) - interval '1 month')::date
  );
  v_next        date := (v_period + interval '1 month')::date;
  v_month_start timestamptz := (v_period::text || ' 00:00:00+00')::timestamptz;
  v_month_end   timestamptz := (v_next::text   || ' 00:00:00+00')::timestamptz;
  v_rows        integer := 0;
  v_plan        record;
  v_verified    integer;
  v_payable     integer;
  v_amount      numeric(10,2);
  MIN_CALL_SECONDS constant integer := 60;   -- a credited call must be a real conversation
BEGIN
  FOR v_plan IN
    SELECT p.agency_id, p.employee_id, p.bonus_unit,
           p.threshold, p.per_unit_amount, e.auth_user_id
    FROM public.employee_bonus_plans p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.enabled = true
      AND e.auth_user_id IS NOT NULL
  LOOP
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
        AND call_length_seconds >= MIN_CALL_SECONDS   -- anti-gaming: real conversation only
        AND call_date >= v_period
        AND call_date <  v_next
    )
    -- anti-gaming: one credit per UNIQUE customer actually reached & verified
    SELECT count(DISTINCT at.norm_phone) INTO v_verified
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
      jsonb_build_object('source', 'auto_monthly_close', 'min_call_seconds', MIN_CALL_SECONDS)
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
$function$;
