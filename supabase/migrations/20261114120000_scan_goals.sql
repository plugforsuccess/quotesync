-- Scans & Quotes goals.
--
-- Two numbers, tracked separately:
--   • Scans: households that sent their policy (dec page), counted once, on the day
--     their first page arrived. Agency goal: scans_goal_daily (8.5) a calendar day.
--   • People quoted: households a producer quoted, scan or not (sales_quotes, which
--     Rate Checks fill in and producers log by hand). Producer goal: quotes_floor (8)
--     a day. Policies quoted (auto + home = 2) are shown beside it, not counted.
-- Scan Rate = people quoted who came with a scan.
--
-- scan_goals(): the Goals tab. Everyone in the agency sees agency totals; managers
-- see every producer, others only their own row.
-- scan_report(token): a read-only summary (team totals, no names) for a shared link.

alter table public.producer_floor_settings
  add column if not exists scans_goal_daily numeric not null default 8.5 check (scans_goal_daily >= 0);
comment on column public.producer_floor_settings.quotes_floor is 'People (households) each producer quotes a calendar day.';
comment on column public.producer_floor_settings.scans_goal_daily is 'Households that send their policy, agency-wide, a calendar day.';

-- Each household's first page: its day, where it came from and who brought it in.
-- A household is keyed by phone (every Rate Check has one), then policy number.
create or replace function public.scan_households(p_agency uuid)
returns table (hh_key text, first_at timestamptz, day date, source text, credit_user uuid)
language sql stable security definer set search_path = public as $$
  with rc as (
    select r.*, coalesce(nullif(regexp_replace(coalesce(r.phone, ''), '\D', '', 'g'), ''), nullif(r.policy_number, ''), r.id::text) as k
    from rate_checks r
    where r.agency_id = p_agency and not coalesce(r.is_test, false)
  ), firsts as (
    select distinct on (k) k, created_at, promoter_id, upload_source, uploaded_by, invite_id, producer_id
    from rc order by k, created_at
  )
  select f.k, f.created_at, (f.created_at at time zone 'America/New_York')::date,
    case when f.promoter_id is not null then 'affiliate'
         when f.upload_source = 'agent' then 'staff'
         when i.source = 'quick_send' then 'quick_send'
         when f.invite_id is not null or f.producer_id is not null then 'link'
         else 'website' end,
    -- An affiliate's scan is the affiliate's, not a producer's.
    case when f.promoter_id is not null then null else coalesce(f.uploaded_by, i.created_by, f.producer_id) end
  from firsts f
  left join rate_check_invites i on i.id = f.invite_id
$$;

-- People quoted a day, per producer: one per household (a lead, or the quote itself
-- when there's no lead), with the policies on those quotes and how many came with a scan.
create or replace function public.scan_quote_days(p_agency uuid, p_from date)
returns table (day date, employee_id uuid, user_id uuid, people integer, policies integer, with_scan integer)
language sql stable security definer set search_path = public as $$
  with q as (
    select sq.quoted_on, sq.employee_id,
      coalesce(sq.lead_id::text, sq.id::text) as person,
      greatest(jsonb_array_length(coalesce(sq.lines, '[]'::jsonb)), coalesce(cardinality(sq.products), 0), 1) as pol,
      (sq.rate_check_id is not null
        or exists (select 1 from jsonb_array_elements(coalesce(sq.lines, '[]'::jsonb)) l where nullif(l->>'rate_check_id', '') is not null)
        or (sq.lead_id is not null and exists (select 1 from rate_checks r where r.lead_id = sq.lead_id and not coalesce(r.is_test, false)))) as scanned
    from sales_quotes sq
    where sq.agency_id = p_agency and not coalesce(sq.is_test, false) and sq.quoted_on >= p_from
  )
  select q.quoted_on, q.employee_id, e.auth_user_id,
    count(distinct q.person)::int, sum(q.pol)::int,
    count(distinct q.person) filter (where q.scanned)::int
  from q left join employees e on e.id = q.employee_id
  group by 1, 2, 3
$$;

revoke all on function public.scan_households(uuid) from public, anon, authenticated;
revoke all on function public.scan_quote_days(uuid, date) from public, anon, authenticated;

create or replace function public.scan_goals(p_agency uuid, p_days integer default 35)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_from date := v_today - least(greatest(coalesce(p_days, 35), 1), 120) + 1;
  v_me uuid := auth.uid();
  v_mgr boolean;
  v_fs producer_floor_settings;
begin
  if p_agency is null or p_agency not in (select get_user_agency_ids()) then
    raise exception 'not allowed';
  end if;
  v_mgr := is_agency_manager(p_agency);
  select * into v_fs from producer_floor_settings where agency_id = p_agency;
  return jsonb_build_object(
    'today', v_today,
    'from', v_from,
    'is_manager', v_mgr,
    'me', v_me,
    'goal_scans', coalesce(v_fs.scans_goal_daily, 8.5),
    'goal_people', coalesce(v_fs.quotes_floor, 8),
    'scans', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'source', source, 'user_id', uid, 'n', n))
      from (
        select day, source, case when v_mgr or credit_user = v_me then credit_user end as uid, count(*)::int as n
        from scan_households(p_agency) where day >= v_from group by 1, 2, 3
      ) s), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'user_id', user_id, 'people', people, 'policies', policies, 'with_scan', with_scan))
      from scan_quote_days(p_agency, v_from) where v_mgr or user_id = v_me), '[]'::jsonb),
    -- Agency-wide quote totals by day, for everyone (no names).
    'team_quotes', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'people', people, 'policies', policies, 'with_scan', with_scan))
      from (select day, sum(people)::int people, sum(policies)::int policies, sum(with_scan)::int with_scan
            from scan_quote_days(p_agency, v_from) group by 1) t), '[]'::jsonb),
    'team', coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'role', m.agency_role,
        'name', coalesce(nullif(p.full_name, ''), p.email, 'Team member')) order by p.full_name)
      from agency_memberships m left join profiles p on p.id = m.user_id
      where m.agency_id = p_agency and m.status = 'active' and (v_mgr or m.user_id = v_me)), '[]'::jsonb)
  );
end $$;
grant execute on function public.scan_goals(uuid, integer) to authenticated;

-- Shared report links: a principal makes one for people outside the agency.
create table if not exists public.scan_report_links (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  label text check (label is null or length(label) <= 80),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists scan_report_links_agency on public.scan_report_links (agency_id);
alter table public.scan_report_links enable row level security;
drop policy if exists scan_report_links_manage on public.scan_report_links;
create policy scan_report_links_manage on public.scan_report_links for all to authenticated
  using (is_agency_manager(agency_id)) with check (is_agency_manager(agency_id));

-- The report itself: last 30 days of team totals. No customer or producer names.
create or replace function public.scan_report(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_agency uuid;
  v_today date := (now() at time zone 'America/New_York')::date;
  v_from date := v_today - 29;
  v_fs producer_floor_settings;
begin
  select agency_id into v_agency from scan_report_links
    where token = p_token and revoked_at is null and length(coalesce(p_token, '')) >= 20;
  if v_agency is null then return null; end if;
  select * into v_fs from producer_floor_settings where agency_id = v_agency;
  return jsonb_build_object(
    'agency', (select coalesce(nullif(brand_name, ''), name) from agencies where id = v_agency),
    'today', v_today,
    'from', v_from,
    'goal_scans', coalesce(v_fs.scans_goal_daily, 8.5),
    'goal_people', coalesce(v_fs.quotes_floor, 8),
    'team', (select count(*) from agency_memberships where agency_id = v_agency and status = 'active'),
    'scans', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'source', source, 'n', n))
      from (select day, source, count(*)::int n from scan_households(v_agency) where day >= v_from group by 1, 2) s), '[]'::jsonb),
    'quotes', coalesce((
      select jsonb_agg(jsonb_build_object('day', day, 'people', people, 'policies', policies, 'with_scan', with_scan))
      from (select day, sum(people)::int people, sum(policies)::int policies, sum(with_scan)::int with_scan
            from scan_quote_days(v_agency, v_from) group by 1) t), '[]'::jsonb),
    'binds', coalesce((
      select jsonb_agg(jsonb_build_object('day', bound_on, 'n', n))
      from (select bound_on, count(*)::int n from sales_binds
            where agency_id = v_agency and not coalesce(is_test, false) and bound_on >= v_from group by 1) b), '[]'::jsonb)
  );
end $$;
grant execute on function public.scan_report(text) to anon, authenticated;

NOTIFY pgrst, 'reload schema';
