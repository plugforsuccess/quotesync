-- Rate Check: competing-agent intelligence + consented partner referrals.
--
-- Phase A  competitor_agents — one row per competing agent/agency seen on an
--          uploaded dec page (matched by carrier + phone, else normalized name),
--          linked from rate_checks.competitor_agent_id.
-- Phase B  competitor_agent_stats view — sightings, ZIPs, premiums, win rate.
-- Phase C  starred watchlist + weekly in-app digest (pg_cron).
-- #5       referral opt-in on rate_checks, referral_partners, referrals.
--
-- INTERNAL USE ONLY: everything is agency-scoped by RLS. Never contact a
-- competitor about a specific customer or share pricing with competitors.

-- ── Phase A: competitor agents ───────────────────────────────────────────────
create table if not exists public.competitor_agents (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  carrier text not null,
  match_key text not null,
  agent_name text,
  agency_name text,
  phone text,
  email text,
  address text,
  agent_code text,
  -- Whether the book can be bought: independent/owned (acquirable), Allstate
  -- (buy via Allstate's EA transfer process), captive-owned (not_acquirable:
  -- recruit instead), or unclear (check). Defaulted from carrier; agents can override.
  book_ownership text not null default 'check'
    check (book_ownership in ('acquirable', 'allstate', 'not_acquirable', 'check')),
  starred boolean not null default false,
  notes text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agency_id, carrier, match_key)
);
create index if not exists competitor_agents_agency_idx on public.competitor_agents(agency_id, last_seen_at desc);

alter table public.rate_checks
  add column if not exists competitor_agent_id uuid references public.competitor_agents(id) on delete set null,
  add column if not exists current_agent jsonb,
  add column if not exists referral_consent_given_at timestamptz,
  add column if not exists referral_consent_version text,
  add column if not exists referral_consent_ip text;
create index if not exists rate_checks_competitor_idx on public.rate_checks(competitor_agent_id);

create or replace function public.competitor_book_ownership(p_carrier text)
returns text
language sql
immutable
as $$
  select case p_carrier
    when 'Allstate' then 'allstate'
    when 'State Farm' then 'not_acquirable'   -- State Farm owns the book; recruit, don't buy
    when 'GEICO' then 'not_acquirable'        -- direct writer
    when 'USAA' then 'not_acquirable'         -- direct writer
    when 'Auto-Owners' then 'acquirable'      -- independent agents own their books
    when 'Erie' then 'acquirable'
    when 'Travelers' then 'acquirable'
    when 'Progressive' then 'acquirable'      -- an agent block on a Progressive dec = independent agent
    when 'Nationwide' then 'acquirable'       -- independent channel since 2020
    else 'check'                              -- Farmers, Georgia Farm Bureau, Liberty Mutual, Other
  end
$$;

-- Upsert a competitor sighting (service role, called by the rate-check function).
-- Match: same agency + carrier + (10-digit phone, else normalized name). Keeps
-- existing values and fills blanks; bumps last_seen_at.
create or replace function public.upsert_competitor_agent(
  p_agency_id uuid, p_carrier text, p_agent_name text, p_agency_name text,
  p_phone text, p_email text, p_address text, p_agent_code text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text := nullif(right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10), '');
  v_name text := lower(regexp_replace(
    regexp_replace(coalesce(nullif(p_agency_name, ''), p_agent_name, ''),
      '\m(agency|agencies|insurance|ins|inc|llc|co|company|the|group|services)\M', '', 'gi'),
    '[^a-z0-9]', '', 'gi'));
  v_key text;
  v_id uuid;
begin
  if v_phone is not null and length(v_phone) = 10 then
    v_key := 'p:' || v_phone;
  elsif v_name <> '' then
    v_key := 'n:' || v_name;
  else
    return null;
  end if;

  insert into public.competitor_agents as c
    (agency_id, carrier, match_key, agent_name, agency_name, phone, email, address, agent_code, book_ownership)
  values
    (p_agency_id, coalesce(nullif(p_carrier, ''), 'Other'), v_key, nullif(p_agent_name, ''), nullif(p_agency_name, ''),
     case when length(coalesce(v_phone, '')) = 10 then v_phone end, nullif(p_email, ''), nullif(p_address, ''),
     nullif(p_agent_code, ''), public.competitor_book_ownership(p_carrier))
  on conflict (agency_id, carrier, match_key) do update set
    agent_name  = coalesce(c.agent_name, excluded.agent_name),
    agency_name = coalesce(c.agency_name, excluded.agency_name),
    phone       = coalesce(c.phone, excluded.phone),
    email       = coalesce(c.email, excluded.email),
    address     = coalesce(c.address, excluded.address),
    agent_code  = coalesce(c.agent_code, excluded.agent_code),
    last_seen_at = now(),
    updated_at   = now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.upsert_competitor_agent(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.upsert_competitor_agent(uuid, text, text, text, text, text, text, text) to service_role;

alter table public.competitor_agents enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'competitor_agents' and policyname = 'competitor_agents_select') then
    create policy competitor_agents_select on public.competitor_agents
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  -- Agents can star, annotate and override book ownership; rows are created by the scan only.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'competitor_agents' and policyname = 'competitor_agents_update') then
    create policy competitor_agents_update on public.competitor_agents
      for update to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end
$$;
-- Supabase grants new tables to anon/authenticated by default; narrow it so agents
-- can only change the watchlist fields, never the scanned identity.
revoke all on public.competitor_agents from anon, authenticated;
grant select, update (starred, notes, book_ownership, updated_at) on public.competitor_agents to authenticated;

-- ── Phase B: per-agent stats ─────────────────────────────────────────────────
create or replace view public.competitor_agent_stats
with (security_invoker = true) as
select
  c.id, c.agency_id, c.carrier, c.agent_name, c.agency_name, c.phone, c.email, c.address,
  c.agent_code, c.book_ownership, c.starred, c.notes, c.first_seen_at, c.last_seen_at,
  count(r.id) as rate_checks,
  array_remove(array_agg(distinct left(r.zip, 5)), null) as zips,
  array_remove(array_agg(distinct r.policy_type), null) as policy_types,
  round(avg(r.annual_premium), 2) as avg_annual_premium,
  count(r.id) filter (where r.status in ('won', 'lost')) as quoted,
  count(r.id) filter (where r.status = 'won') as wins,
  round(100.0 * count(r.id) filter (where r.status = 'won')
    / nullif(count(r.id) filter (where r.status in ('won', 'lost')), 0), 1) as win_rate_pct,
  round(avg(r.delta) filter (where r.status = 'won'), 2) as avg_savings_when_won,
  coalesce(sum(r.annual_premium), 0) as total_annual_premium_seen
from public.competitor_agents c
left join public.rate_checks r on r.competitor_agent_id = c.id
group by c.id;
grant select on public.competitor_agent_stats to authenticated;

-- ── Phase C: weekly watchlist digest ─────────────────────────────────────────
-- One in-app notification per principal/manager per agency, listing starred
-- competitors with new rate checks or new outcomes in the last 7 days.
create or replace function public.competitor_watch_digest()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  v_lines text;
  v_count int;
  v_sent int := 0;
begin
  for a in select distinct agency_id from public.competitor_agents where starred loop
    select string_agg(line, E'\n' order by line), count(*) into v_lines, v_count
    from (
      select coalesce(c.agency_name, c.agent_name, 'Unknown agent') || ' (' || c.carrier || '): '
        || count(r.id) filter (where r.created_at >= now() - interval '7 days') || ' new rate check(s), '
        || count(r.id) filter (where r.outcome_at >= now() - interval '7 days' and r.status = 'won') || ' won / '
        || count(r.id) filter (where r.outcome_at >= now() - interval '7 days' and r.status in ('won', 'lost')) || ' quoted this week'
        || coalesce(' · overall win rate ' || round(100.0 * count(r.id) filter (where r.status = 'won')
             / nullif(count(r.id) filter (where r.status in ('won', 'lost')), 0)) || '%', '') as line
      from public.competitor_agents c
      join public.rate_checks r on r.competitor_agent_id = c.id
      where c.agency_id = a.agency_id and c.starred
      group by c.id
      having count(r.id) filter (where r.created_at >= now() - interval '7 days'
                                    or r.outcome_at >= now() - interval '7 days') > 0
    ) s;

    if v_count > 0 then
      insert into public.notifications (user_id, type, title, message, metadata)
      select distinct m.user_id, 'COMPETITOR_WATCH', 'Competitor watch — this week', v_lines,
             jsonb_build_object('agency_id', a.agency_id, 'agents', v_count)
      from public.agency_memberships m
      where m.agency_id = a.agency_id and m.status = 'active'
        and m.agency_role in ('owner', 'principal', 'manager');
      v_sent := v_sent + 1;
    end if;
  end loop;
  return v_sent;
end;
$$;
revoke execute on function public.competitor_watch_digest() from public, anon, authenticated;

-- Mondays 12:47 UTC (≈ 8:47 am Eastern). cron.schedule upserts by name.
select cron.schedule('competitor-watch-digest', '47 12 * * 1', $$ select public.competitor_watch_digest(); $$);

-- ── #5: referral partners + referrals (opt-in only) ──────────────────────────
create table if not exists public.referral_partners (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  lines text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists referral_partners_agency_idx on public.referral_partners(agency_id, active);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  rate_check_id uuid not null references public.rate_checks(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  partner_id uuid not null references public.referral_partners(id),
  line text,
  note text,
  referred_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists referrals_rate_check_idx on public.referrals(rate_check_id);

-- A referral can only be logged for a rate check whose consumer opted in, and
-- only to a partner of the same agency.
create or replace function public.referrals_require_consent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.rate_checks r
    where r.id = new.rate_check_id and r.agency_id = new.agency_id
      and r.referral_consent_given_at is not null
  ) then
    raise exception 'Customer has not consented to partner referrals' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.referral_partners p
    where p.id = new.partner_id and p.agency_id = new.agency_id and p.active
  ) then
    raise exception 'Partner is not active for this agency' using errcode = 'P0001';
  end if;
  new.referred_by := coalesce(new.referred_by, auth.uid());
  return new;
end;
$$;
create or replace trigger referrals_require_consent
  before insert on public.referrals
  for each row execute function public.referrals_require_consent();

alter table public.referral_partners enable row level security;
alter table public.referrals enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referral_partners' and policyname = 'referral_partners_rw') then
    create policy referral_partners_rw on public.referral_partners
      for all to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referrals' and policyname = 'referrals_select') then
    create policy referrals_select on public.referrals
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'referrals' and policyname = 'referrals_insert') then
    create policy referrals_insert on public.referrals
      for insert to authenticated
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end
$$;
revoke all on public.referral_partners, public.referrals from anon, authenticated;
grant select, insert, update on public.referral_partners to authenticated;
grant select, insert on public.referrals to authenticated;  -- referral log is append-only

NOTIFY pgrst, 'reload schema';
