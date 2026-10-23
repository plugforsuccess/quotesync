-- Rate Check partners: people outside the agency (friends, influencers) who share a
-- permanent link and are paid a flat fee per qualified household they send, by
-- what the household sends (never by what it buys). Not the same as
-- referral_partners, which are agencies we send customers to.
--
-- promoters        who they are and their link code (same /r/CODE space as invites)
-- promoter_rates   the agency's pay schedule, per tier (editable by managers)
-- promoter_payouts what was paid for which month (one row per partner per month)
-- rate_checks.promoter_id  which partner's link a scan came through

create table if not exists public.rate_check_promoters (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  phone           text check (phone is null or phone ~ '^\d{10}$'),
  email           text check (email is null or length(email) <= 200),
  code            text not null unique default public.rc_invite_code(),
  active          boolean not null default true,
  w9_received_at  timestamptz,
  notes           text,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists rate_check_promoters_agency_idx on public.rate_check_promoters (agency_id, created_at desc);

create table if not exists public.rate_check_promoter_rates (
  agency_id  uuid not null references public.agencies(id) on delete cascade,
  tier       text not null check (tier in ('auto_home', 'auto_renters', 'home_only', 'auto_only', 'renters_only', 'extra_line')),
  amount     numeric(8,2) not null check (amount >= 0 and amount <= 10000),
  updated_at timestamptz not null default now(),
  primary key (agency_id, tier)
);

create table if not exists public.rate_check_promoter_payouts (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  promoter_id uuid not null references public.rate_check_promoters(id) on delete cascade,
  period      date not null check (extract(day from period) = 1),   -- first day of the month paid for
  households  integer not null check (households >= 0),
  amount      numeric(10,2) not null check (amount >= 0),
  paid_at     timestamptz not null default now(),
  paid_by     uuid references auth.users(id) on delete set null,
  note        text,
  unique (promoter_id, period)
);

alter table public.rate_checks
  add column if not exists promoter_id uuid references public.rate_check_promoters(id) on delete set null;
create index if not exists rate_checks_promoter_idx on public.rate_checks (promoter_id, created_at) where promoter_id is not null;

-- ── RLS: everyone in the agency can see partners and the schedule; only
-- owners / principals / managers add partners, change pay or record payouts.
alter table public.rate_check_promoters enable row level security;
alter table public.rate_check_promoter_rates enable row level security;
alter table public.rate_check_promoter_payouts enable row level security;

do $$
declare t text;
begin
  foreach t in array array['rate_check_promoters', 'rate_check_promoter_rates', 'rate_check_promoter_payouts'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_select') then
      execute format(
        'create policy %I on public.%I for select to authenticated using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()))',
        t || '_select', t);
    end if;
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_manage') then
      execute format(
        'create policy %I on public.%I for all to authenticated
           using (agency_id in (select m.agency_id from public.agency_memberships m
                  where m.user_id = auth.uid() and m.status = ''active'' and m.agency_role in (''owner'',''principal'',''manager'')))
           with check (agency_id in (select m.agency_id from public.agency_memberships m
                  where m.user_id = auth.uid() and m.status = ''active'' and m.agency_role in (''owner'',''principal'',''manager'')))',
        t || '_manage', t);
    end if;
  end loop;
end $$;

revoke all on public.rate_check_promoters, public.rate_check_promoter_rates, public.rate_check_promoter_payouts from anon;
grant select, insert, update, delete on public.rate_check_promoters, public.rate_check_promoter_rates, public.rate_check_promoter_payouts to authenticated;

comment on table public.rate_check_promoters is 'Rate Check partners: people outside the agency paid per qualified household sent through their /r/CODE link.';
comment on table public.rate_check_promoter_rates is 'Partner pay schedule per tier (per household, by the dec pages it sends).';
comment on table public.rate_check_promoter_payouts is 'Partner payouts recorded per month.';

notify pgrst, 'reload schema';
