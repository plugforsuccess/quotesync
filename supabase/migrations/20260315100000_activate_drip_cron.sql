-- Activate the lead SMS drip cron schedule
-- Prerequisites: pg_cron and pg_net extensions must be enabled in Supabase dashboard
-- Fires every 15 minutes (reduced from 30 to catch the T+2h window more precisely)

SELECT cron.schedule(
  'lead-sms-drip',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/lead-sms-drip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
