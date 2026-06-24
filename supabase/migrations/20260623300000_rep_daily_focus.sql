-- The Today strip's "/8" is meant to drive the rep through their top-priority
-- cases for the day. Counting any worked case (or a live top-N cut) doesn't do
-- that: a live cut has a moving denominator — work and CLOSE your #1 priority and
-- it drops out of the ranking, so the bar goes backward. Snapshot each rep's
-- top-N priority cases once per day so "/8" means a FIXED set of priority cases,
-- and a case you worked stays counted even after you close it.

create table if not exists public.rep_daily_focus (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  employee_id uuid not null,
  focus_date date not null,
  case_type text not null check (case_type in ('cancel','renewal')),
  case_id uuid not null,
  rank int,
  created_at timestamptz not null default now()
);
create unique index if not exists rep_daily_focus_unique
  on public.rep_daily_focus (employee_id, focus_date, case_type, case_id);
create index if not exists rep_daily_focus_lookup
  on public.rep_daily_focus (employee_id, focus_date);

alter table public.rep_daily_focus enable row level security;

-- A rep owns their own day's focus set (read + snapshot insert).
drop policy if exists rep_daily_focus_own on public.rep_daily_focus;
create policy rep_daily_focus_own on public.rep_daily_focus
  for all
  using (employee_id in (select id from public.employees where auth_user_id = auth.uid()))
  with check (employee_id in (select id from public.employees where auth_user_id = auth.uid()));

-- Agency members can read (principal visibility into who's working their list).
drop policy if exists rep_daily_focus_agency_read on public.rep_daily_focus;
create policy rep_daily_focus_agency_read on public.rep_daily_focus
  for select
  using (agency_id in (select agency_id from public.agency_memberships where user_id = auth.uid() and status = 'active'));

notify pgrst, 'reload schema';
