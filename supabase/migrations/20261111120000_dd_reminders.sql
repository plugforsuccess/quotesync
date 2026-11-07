-- Drivers Ed reminder emails (supabase/functions/dd-reminders): what was sent, who
-- unsubscribed, and a daily run. Service role only (no client policies).
create table if not exists public.dd_reminder_log (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.dd_enrollments(id) on delete cascade,
  kind          text not null check (kind in ('retake_60', 'retake_14', 'stall_3', 'stall_10')),
  due_on        date not null,
  email         text,
  sent_at       timestamptz not null default now(),
  unique (enrollment_id, kind, due_on)
);
alter table public.dd_reminder_log enable row level security;

create table if not exists public.dd_email_opt_outs (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table public.dd_email_opt_outs enable row level security;

-- Every morning at 9:23 Eastern (14:23 UTC; 13:23 during daylight time, fine either way).
select cron.unschedule('dd-reminders') where exists (select 1 from cron.job where jobname = 'dd-reminders');
select cron.schedule('dd-reminders', '23 14 * * *', $$
  select net.http_post(
    url := 'https://ghnpzllykteelveezhnv.supabase.co/functions/v1/dd-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_buYz6tKABrI7M1J1uUSdlw_Z9pR56cP'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

NOTIFY pgrst, 'reload schema';
