-- 033_employee_verification_cron.sql
-- pg_cron job: daily verification check at 1 PM UTC (8 AM ET).
-- Calls the check-employee-verification Edge Function via pg_net.

-- NOTE: Requires pg_cron and pg_net extensions to be enabled.
-- Run this after deploying the check-employee-verification Edge Function.

SELECT cron.schedule(
  'check-employee-verification',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.edge_function_url') || '/check-employee-verification',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
