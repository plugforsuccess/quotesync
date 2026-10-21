-- Rate Check retention: purge dec-page images 90 days after upload.
--
-- Storage objects can't be deleted from SQL (storage.protect_delete), so the
-- daily job calls the rate-check-cleanup edge function, which removes the
-- images through the Storage API and nulls rate_checks.image_path (extracted
-- data is kept).
--
-- The URL is literal on purpose: the app.settings.supabase_url /
-- service_role_key settings the older cron jobs read are not set on this
-- project. rate-check-cleanup is verify_jwt = false and input-free (it only
-- ever purges past-retention images), so no secret is stored here; the
-- apikey header is the public publishable key.
--
-- cron.schedule upserts by job name, so re-running this migration is idempotent.
select cron.schedule(
  'rate-check-image-cleanup',
  '17 8 * * *',
  $$
  select net.http_post(
    url := 'https://ghnpzllykteelveezhnv.supabase.co/functions/v1/rate-check-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_buYz6tKABrI7M1J1uUSdlw_Z9pR56cP'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
