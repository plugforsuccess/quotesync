-- Migration: Cron jobs for discrepancy detection and weekly digest
-- Requires pg_cron and pg_net extensions to be enabled in the Supabase dashboard.
--
-- NOTE: Before running this migration, enable these extensions in the Supabase Dashboard:
--   1. Go to Database > Extensions
--   2. Enable "pg_cron" (for scheduling)
--   3. Enable "pg_net" (for HTTP requests from SQL)
--
-- Also set these Supabase Secrets:
--   - SLACK_WEBHOOK_URL: Slack incoming webhook URL for #ops-alerts
--   - APP_BASE_URL: e.g. https://admin.insuredbycam.com
--
-- The SERVICE_ROLE_KEY and SUPABASE_URL are automatically available.

-- ── Nightly discrepancy check (9 PM ET = 1 AM UTC next day) ────────────────
-- Runs every night at 1 AM UTC (9 PM ET) to detect discrepancies for the
-- current week across all employees. Catches time entry changes made after
-- the RC upload.

SELECT cron.schedule(
  'nightly-discrepancy-check',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/detect-discrepancies',
    body := '{"scope": "current_week"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    )
  );
  $$
);

-- ── Friday weekly digest (5 PM ET = 10 PM UTC) ─────────────────────────────
-- Sends a weekly summary to Slack every Friday at 10 PM UTC (5 PM ET).
-- Includes per-employee grades, outbound calls, utilization, and flag counts.

SELECT cron.schedule(
  'friday-weekly-digest',
  '0 22 * * 5',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/detect-discrepancies',
    body := '{"scope": "weekly_digest"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    )
  );
  $$
);
