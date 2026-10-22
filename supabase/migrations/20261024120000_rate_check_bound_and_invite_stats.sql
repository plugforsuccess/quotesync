-- "Bound" step + event/producer scoreboard through to revenue.
--
-- A won rate check is bound when the policy is actually written (Allstate or
-- an expanded-market carrier). That closes the loop so the Links sent
-- scoreboard can count quotes, wins and binds per event and per producer.

-- Status 'bound' (terminal, after 'won'). The won/lost trigger only acts on
-- the statuses it lists, so a bound row is never flipped back.
alter table public.rate_checks drop constraint if exists rate_checks_status_check;
alter table public.rate_checks add constraint rate_checks_status_check
  check (status in ('pending','extracted','extract_failed','quoted','won','lost','declined','bound'));

alter table public.rate_checks
  add column if not exists bound_carrier text,
  add column if not exists bound_premium numeric,
  add column if not exists bound_at      timestamptz,
  add column if not exists bound_by      uuid references auth.users(id) on delete set null;

-- Scoreboard: links sent → opened → uploaded → quoted → won → bound, by event and producer.
create or replace view public.rate_check_invite_stats
with (security_invoker = true) as
with inv as (
  select agency_id, coalesce(event_name, '') as event_name, coalesce(producer_name, '') as producer_name,
         count(*) as invites,
         count(*) filter (where opened_at is not null) as opened,
         count(*) filter (where upload_count > 0) as uploaded
  from public.rate_check_invites
  group by 1, 2, 3
),
rc as (
  select agency_id, coalesce(event_name, '') as event_name, coalesce(producer_name, '') as producer_name,
         count(*) as rate_checks,
         count(*) filter (where status in ('quoted','won','lost','bound')) as quoted,
         count(*) filter (where status in ('won','bound')) as won,
         count(*) filter (where status = 'bound') as bound,
         coalesce(sum(bound_premium) filter (where status = 'bound'), 0) as bound_premium
  from public.rate_checks
  where invite_id is not null or producer_id is not null or event_name is not null
  group by 1, 2, 3
)
select coalesce(inv.agency_id, rc.agency_id) as agency_id,
       coalesce(inv.event_name, rc.event_name) as event_name,
       coalesce(inv.producer_name, rc.producer_name) as producer_name,
       coalesce(inv.invites, 0) as invites, coalesce(inv.opened, 0) as opened, coalesce(inv.uploaded, 0) as uploaded,
       coalesce(rc.rate_checks, 0) as rate_checks, coalesce(rc.quoted, 0) as quoted,
       coalesce(rc.won, 0) as won, coalesce(rc.bound, 0) as bound, coalesce(rc.bound_premium, 0) as bound_premium
from inv full outer join rc
  on inv.agency_id = rc.agency_id and inv.event_name = rc.event_name and inv.producer_name = rc.producer_name;
grant select on public.rate_check_invite_stats to authenticated;

NOTIFY pgrst, 'reload schema';
