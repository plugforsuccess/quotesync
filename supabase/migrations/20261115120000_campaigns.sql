-- Campaigns: email and text drips and one-time blasts the principal builds (Campaigns page).
--
--   campaigns             one campaign: who it goes to (audience), its steps, its status.
--     kind  'drip'        steps on days counted from when each person joins the campaign
--                         (everyone in the audience when it starts, unless include_existing is
--                         off, plus anyone who joins the audience later).
--           'blast'       one message to everyone in the audience, at send_at.
--     audience            { type: 'lists', list_ids: [] }        contact lists ([] = all)
--                         { type: 'leads', statuses: [] }        Rate Check households by where
--                                                                they are: waiting, quoted, won,
--                                                                unreadable
--                         { type: 'affiliates', which: 'active'|'all' }
--                         { type: 'dd_students', which: 'completed'|'all' }
--     steps               [{ id, channel: 'email'|'text', day, subject, body, button, button_label }]
--   campaign_enrollments  each person in a campaign and how far along they are.
--   campaign_sends        every email and text sent (or skipped), for the numbers.
--
-- Sending is supabase/functions/campaigns-run (hourly, pg_cron). Writes to enrollments and
-- sends are the function's (service role); the principal and managers read and edit campaigns.
-- Texts only go to people who agreed to texts (a Rate Check with the text box checked, or an
-- affiliate who accepted the program terms) and never to anyone who replied STOP.

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  kind text not null default 'drip' check (kind in ('drip', 'blast')),
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'done')),
  audience jsonb not null default '{"type": "lists", "list_ids": []}'::jsonb,
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) <= 12),
  include_existing boolean not null default true,
  stop_on_upload boolean not null default true,
  send_at timestamptz,
  started_at timestamptz,
  -- When a drip that skips people already in the audience took its first look (they're
  -- recorded then, never messaged); null until the first run.
  baseline_at timestamptz,
  finished_at timestamptz,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists campaigns_agency on public.campaigns (agency_id) where archived_at is null;

create table if not exists public.campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  person_key text not null,
  first_name text,
  email text,
  phone text,
  enrolled_at timestamptz not null default now(),
  steps_done integer not null default 0,
  last_sent_at timestamptz,
  stopped_reason text,
  unique (campaign_id, person_key)
);
create index if not exists campaign_enrollments_open on public.campaign_enrollments (campaign_id) where stopped_reason is null;

create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  enrollment_id uuid references public.campaign_enrollments(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  step integer not null,
  channel text not null check (channel in ('email', 'text')),
  status text not null check (status in ('sent', 'failed', 'skipped')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists campaign_sends_campaign on public.campaign_sends (campaign_id, created_at desc);
create index if not exists campaign_sends_agency_day on public.campaign_sends (agency_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_enrollments enable row level security;
alter table public.campaign_sends enable row level security;

drop policy if exists campaigns_manage on public.campaigns;
create policy campaigns_manage on public.campaigns for all to authenticated
  using (is_agency_manager(agency_id)) with check (is_agency_manager(agency_id));
drop policy if exists campaign_enrollments_read on public.campaign_enrollments;
create policy campaign_enrollments_read on public.campaign_enrollments for select to authenticated
  using (is_agency_manager(agency_id));
drop policy if exists campaign_sends_read on public.campaign_sends;
create policy campaign_sends_read on public.campaign_sends for select to authenticated
  using (is_agency_manager(agency_id));

create or replace function public.campaigns_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists campaigns_touch on public.campaigns;
create trigger campaigns_touch before update on public.campaigns for each row execute function public.campaigns_touch();

-- Everyone an audience covers right now, one row a person.
--   person_key  stable within a campaign (a list member's email, a household's phone, …)
--   sms_ok      they agreed to texts
--   extra       what links need: an affiliate's code and portal token
create or replace function public.campaign_audience_people(p_agency uuid, p_audience jsonb)
returns table (person_key text, first_name text, email text, phone text, sms_ok boolean, extra jsonb)
language plpgsql stable security definer set search_path = public as $$
declare
  t text := coalesce(p_audience->>'type', 'lists');
  ids uuid[];
  statuses text[];
  rc_statuses text[];
begin
  if t = 'lists' then
    select coalesce(array_agg(x::uuid), '{}') into ids from jsonb_array_elements_text(coalesce(p_audience->'list_ids', '[]'::jsonb)) x;
    return query
      select distinct on (lower(m.email))
        'e:' || lower(m.email), split_part(trim(coalesce(m.first_name, '')), ' ', 1), lower(m.email),
        nullif(right(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g'), 10), ''), false, '{}'::jsonb
      from contact_list_members m
      join contact_lists l on l.id = m.list_id and l.archived_at is null
      where m.agency_id = p_agency and coalesce(m.email, '') <> ''
        and (cardinality(ids) = 0 or m.list_id = any(ids))
      order by lower(m.email), m.created_at;

  elsif t = 'leads' then
    select coalesce(array_agg(x), '{}') into statuses from jsonb_array_elements_text(coalesce(p_audience->'statuses', '[]'::jsonb)) x;
    rc_statuses := array(select s from unnest(array[
      case when 'waiting' = any(statuses) then 'pending' end, case when 'waiting' = any(statuses) then 'extracted' end,
      case when 'quoted' = any(statuses) then 'quoted' end, case when 'quoted' = any(statuses) then 'lost' end,
      case when 'won' = any(statuses) then 'won' end,
      case when 'unreadable' = any(statuses) then 'extract_failed' end]) s where s is not null);
    return query
      with rc as (
        select r.*, right(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), 10) as d
        from rate_checks r
        where r.agency_id = p_agency and not coalesce(r.is_test, false) and r.duplicate_of is null
      ), hh as (
        -- A household: its latest Rate Check decides where it is; any of its Rate Checks can
        -- give the email and the text consent.
        select rc.d,
          (array_agg(rc.status order by rc.created_at desc))[1] as status,
          (array_agg(rc.first_name order by rc.created_at desc) filter (where coalesce(rc.first_name, '') <> ''))[1] as first_name,
          (array_agg(lower(rc.email) order by rc.created_at desc) filter (where coalesce(rc.email, '') <> ''))[1] as email,
          bool_or(rc.sms_consent = 'opted_in') as sms_ok
        from rc where length(rc.d) = 10 group by rc.d
      )
      select 'p:' || hh.d, split_part(trim(coalesce(hh.first_name, '')), ' ', 1), hh.email, hh.d, coalesce(hh.sms_ok, false), '{}'::jsonb
      from hh where hh.status = any(rc_statuses);

  elsif t = 'affiliates' then
    return query
      select 'a:' || p.id::text, split_part(trim(coalesce(p.name, '')), ' ', 1), nullif(lower(trim(coalesce(p.email, ''))), ''),
        nullif(right(regexp_replace(coalesce(p.phone, ''), '\D', '', 'g'), 10), ''),
        p.terms_accepted_at is not null,
        jsonb_build_object('code', p.code, 'portal_token', p.portal_token)
      from rate_check_promoters p
      where p.agency_id = p_agency and not coalesce(p.is_test, false)
        and (coalesce(p_audience->>'which', 'active') = 'all' or p.active);

  elsif t = 'dd_students' then
    -- Drivers Ed belongs to the default agency.
    if not exists (select 1 from agencies a where a.id = p_agency and a.is_default) then return; end if;
    return query
      select distinct on (e.user_id) 'u:' || e.user_id::text, split_part(trim(coalesce(e.student_name_snapshot, pr.full_name, '')), ' ', 1),
        nullif(lower(trim(coalesce(pr.email, ''))), ''), null::text, false, '{}'::jsonb
      from dd_enrollments e
      left join profiles pr on pr.id = e.user_id
      where (coalesce(p_audience->>'which', 'all') = 'all' or e.status = 'completed')
      order by e.user_id, e.created_at desc;
  end if;
end $$;
revoke all on function public.campaign_audience_people(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.campaign_audience_people(uuid, jsonb) to service_role;

-- How many people an audience covers, and how many can get an email or a text (Campaigns page).
create or replace function public.campaign_audience_count(p_agency uuid, p_audience jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_agency_manager(p_agency) then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'people', count(*),
    'email', count(*) filter (where a.email is not null and not exists (select 1 from dd_email_opt_outs o where lower(o.email) = a.email)),
    'text', count(*) filter (where a.sms_ok and a.phone is not null and not exists (
      select 1 from sms_opt_outs s where s.phone = a.phone and s.opted_in_at is null)),
    'sample', coalesce((select jsonb_agg(n) from (select nullif(b.first_name, '') n from campaign_audience_people(p_agency, p_audience) b where nullif(b.first_name, '') is not null limit 5) z), '[]'::jsonb)
  ) into r
  from campaign_audience_people(p_agency, p_audience) a;
  return r;
end $$;
grant execute on function public.campaign_audience_count(uuid, jsonb) to authenticated;

-- Hourly. The function itself only sends 9am–8pm Eastern.
select cron.unschedule('campaigns-run') where exists (select 1 from cron.job where jobname = 'campaigns-run');
select cron.schedule('campaigns-run', '11 * * * *', $$
  select net.http_post(
    url := 'https://ghnpzllykteelveezhnv.supabase.co/functions/v1/campaigns-run',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_buYz6tKABrI7M1J1uUSdlw_Z9pR56cP'),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

NOTIFY pgrst, 'reload schema';
