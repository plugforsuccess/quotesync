-- Migration: Cron jobs for discrepancy detection and weekly digest
-- Requires pg_cron, pg_net, and Vault extensions to be enabled in the Supabase dashboard.
--
-- SETUP (Supabase Dashboard):
--   1. Database > Extensions → Enable "pg_cron", "pg_net", and "pgsodium" (for Vault)
--   2. Go to Project Settings > Vault
--   3. Add two secrets:
--        Name: detect_discrepancies_url
--        Value: https://YOUR_PROJECT.supabase.co/functions/v1/detect-discrepancies
--
--        Name: service_role_key
--        Value: (your service role key from Project Settings > API)
--
--   4. Also set these Supabase Edge Function Secrets (Settings > Edge Functions):
--        SLACK_WEBHOOK_ALERTS  — Slack incoming webhook for #ops-alerts
--        SLACK_WEBHOOK_DIGEST  — Slack incoming webhook for #weekly-digest
--        APP_BASE_URL          — e.g. https://admin.insuredbycam.com
--
-- SECURITY:
--   The service role key is stored in Vault (encrypted at rest) and retrieved at
--   runtime via vault.decrypted_secrets. It never appears in this migration file,
--   the cron.job table, or version control.
--
-- KEY ROTATION:
--   If the service role key is rotated, update the "service_role_key" secret in
--   Vault. The cron jobs will pick up the new value automatically on next run.

-- ── Helper function: retrieve a Vault secret by name ────────────────────────
-- Encapsulates the Vault lookup so the cron SQL stays readable.

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$$;

-- Restrict to postgres role (cron jobs run as postgres)
REVOKE ALL ON FUNCTION internal.get_vault_secret(text) FROM PUBLIC;

-- ── Nightly discrepancy check (9 PM ET = 1 AM UTC next day) ────────────────
-- Runs every night at 1 AM UTC (9 PM ET) to detect discrepancies for the
-- current week across all employees. Catches time entry changes made after
-- the RC upload.

SELECT cron.schedule(
  'nightly-discrepancy-check',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := internal.get_vault_secret('detect_discrepancies_url'),
    body := '{"scope": "current_week"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || internal.get_vault_secret('service_role_key'),
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
    url := internal.get_vault_secret('detect_discrepancies_url'),
    body := '{"scope": "weekly_digest"}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || internal.get_vault_secret('service_role_key'),
      'Content-Type', 'application/json'
    )
  );
  $$
);
