-- Activate the call queue cron schedule
-- Prerequisites: pg_cron and pg_net extensions must be enabled in Supabase dashboard
-- Fires every minute to process call_queue rows where fire_after <= now()

SELECT cron.schedule(
  'lead-initiate-call',
  '*/1 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/lead-initiate-call',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
