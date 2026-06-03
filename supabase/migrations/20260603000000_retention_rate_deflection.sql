-- Retention Engine — Rate-Deflection Warm Transfer (Campaign B)
--
-- Adds the tracking columns the rate-deflection campaign needs, mapped onto the
-- live `renewal_cases` schema (the spec's `policies`/`clients`/`bland_calls`
-- tables do not exist in this codebase — renewal_cases + customer_consent +
-- ai_call_log are the canonical retention tables).
--
-- Every statement is guarded so this is safe to run against any environment,
-- including ones where renewal_cases / ai_call_log were created directly via the
-- Supabase MCP rather than through a committed migration.

-- ── renewal_cases: retention state + over-dial guard ─────────────────────────
DO $$
BEGIN
  IF to_regclass('public.renewal_cases') IS NOT NULL THEN
    -- Communication state used by the retention engine / dashboards.
    --   'stable'         — no active retention concern
    --   'at_risk'        — customer hesitant / shopping signals
    --   'crisis_capture' — escalation; a producer must intervene now
    ALTER TABLE public.renewal_cases
      ADD COLUMN IF NOT EXISTS retention_status text NOT NULL DEFAULT 'stable';

    -- Idempotency / anti-over-dial lock. The dispatcher stamps this to
    -- CURRENT_DATE at the start of a run so a retried DB webhook cannot
    -- double-dial the same case in a single day.
    ALTER TABLE public.renewal_cases
      ADD COLUMN IF NOT EXISTS last_retention_call_date date;

    CREATE INDEX IF NOT EXISTS idx_renewal_cases_renewal_date
      ON public.renewal_cases (renewal_date);
  END IF;
END $$;

-- ── ai_call_log: tag which retention campaign produced the call ───────────────
DO $$
BEGIN
  IF to_regclass('public.ai_call_log') IS NOT NULL THEN
    -- 'preemptive_60' | 'rate_deflection' | 'claim_audit' | 'renewal'
    ALTER TABLE public.ai_call_log
      ADD COLUMN IF NOT EXISTS campaign_type text;

    CREATE INDEX IF NOT EXISTS idx_ai_call_log_campaign
      ON public.ai_call_log (policy_id, campaign_type);
  END IF;
END $$;

-- ── Database Webhook: fire Campaign B when the premium delta crosses 8% ───────
-- Uses pg_net + the same app.* settings the existing Bland crons rely on. The
-- WHEN clause makes this fire only on the upward crossing, so routine row
-- updates never re-dial. The edge function re-validates every gate (consent,
-- call window, idempotency) before any call is placed.
CREATE OR REPLACE FUNCTION public.fn_trigger_rate_deflection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url  text := current_setting('app.supabase_url', true);
  v_key  text := current_setting('app.service_role_key', true);
BEGIN
  -- Fail safe: the renewal_cases write must succeed even if dispatch can't.
  -- Missing config or a pg_net hiccup is logged, never propagated.
  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE WARNING '[rate_deflection] app.supabase_url / service_role_key not set — skipping dispatch for %', NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url || '/functions/v1/trigger-rate-deflection',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_key
      ),
      body    := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'policy_id', NEW.id,
        'record', row_to_json(NEW),
        'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[rate_deflection] dispatch failed for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

-- Two separate triggers so the WHEN clause never references OLD on an INSERT
-- (OLD is not defined for INSERT events).
DO $$
BEGIN
  IF to_regclass('public.renewal_cases') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_rate_deflection_ins ON public.renewal_cases;
    CREATE TRIGGER trg_rate_deflection_ins
      AFTER INSERT ON public.renewal_cases
      FOR EACH ROW
      WHEN (NEW.premium_change_pct > 8)
      EXECUTE FUNCTION public.fn_trigger_rate_deflection();

    DROP TRIGGER IF EXISTS trg_rate_deflection_upd ON public.renewal_cases;
    CREATE TRIGGER trg_rate_deflection_upd
      AFTER UPDATE ON public.renewal_cases
      FOR EACH ROW
      WHEN (
        NEW.premium_change_pct > 8
        AND (OLD.premium_change_pct IS NULL OR OLD.premium_change_pct <= 8)
      )
      EXECUTE FUNCTION public.fn_trigger_rate_deflection();
  END IF;
END $$;
