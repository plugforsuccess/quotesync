-- Retention Engine — Pre-Renewal Outreach (single campaign)
--
-- Adds the tracking columns the pre-renewal outreach sweep needs, mapped onto
-- the live `renewal_cases` schema (the spec's `policies`/`clients`/`bland_calls`
-- tables do not exist in this codebase — renewal_cases + customer_consent +
-- ai_call_log are the canonical retention tables), and schedules the daily
-- 45→32 DTE sweep (renewal-outreach-sweep). There is one outreach campaign; the
-- script branches on the rate change rather than running separate pipelines.
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

    -- Single-fire / anti-over-dial lock. The sweep stamps this to CURRENT_DATE
    -- when it places a call, so a case is contacted at most once per renewal
    -- cycle even if the daily sweep runs again.
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

-- ── Daily pre-renewal outreach sweep (single campaign) ───────────────────────
-- Replaces the old instant per-row trigger. Instant firing was wrong for this
-- strategy: the renewal lands in the agency queue at 45 DTE but the customer
-- isn't notified until 31 DTE, so contact must be *windowed* (45→32 DTE), not
-- fired the moment the rate data arrives. A daily cron lets renewal-outreach-sweep
-- pick up cases as they enter the window and fire once each.
--
-- 13:30 UTC ≈ 8:30/9:30am Eastern — inside the 8am–2pm window. The function
-- re-checks the window + weekday itself, so the exact cron minute is not load-bearing.
SELECT cron.schedule(
  'renewal-outreach-sweep',
  '30 13 * * 1-5',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/renewal-outreach-sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
