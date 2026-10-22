-- Tagged invite links for events.
--
-- A producer at a booth creates an invite (name, mobile, event) and texts or
-- emails the short link from their own phone. When the customer uploads later
-- from the link, the rate check lands tagged with the producer and the event,
-- and the producer is notified. One link can take several uploads (auto +
-- home from different carriers). Links expire after 30 days.

-- Short, unambiguous, unguessable: 8 chars from a 32-char alphabet (~1e12).
create or replace function public.rc_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(8);
  out text := '';
  i int;
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return out;
end;
$$;

create table if not exists public.rate_check_invites (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  code               text not null unique default public.rc_invite_code(),
  created_by         uuid not null references auth.users(id) on delete cascade,
  producer_name      text,                      -- denormalised so the inbox can show "via Marcus" without a profiles join
  event_name         text,
  first_name         text,
  phone              text,                      -- 10 digits, optional
  expires_at         timestamptz not null default now() + interval '30 days',
  opened_at          timestamptz,
  open_count         int not null default 0,
  upload_count       int not null default 0,
  last_rate_check_id uuid,
  created_at         timestamptz not null default now()
);
create index if not exists rate_check_invites_agency_idx on public.rate_check_invites (agency_id, created_at desc);
create index if not exists rate_check_invites_event_idx on public.rate_check_invites (agency_id, event_name);

alter table public.rate_check_invites enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_invites' and policyname = 'rate_check_invites_select') then
    create policy rate_check_invites_select on public.rate_check_invites
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_invites' and policyname = 'rate_check_invites_insert') then
    create policy rate_check_invites_insert on public.rate_check_invites
      for insert to authenticated
      with check (agency_id in (select public.get_user_agency_ids()) and created_by = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_invites' and policyname = 'rate_check_invites_update') then
    create policy rate_check_invites_update on public.rate_check_invites
      for update to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end $$;

revoke all on public.rate_check_invites from anon;
revoke all on public.rate_check_invites from authenticated;
grant select, insert on public.rate_check_invites to authenticated;
grant update (event_name, first_name, phone, expires_at) on public.rate_check_invites to authenticated;

-- Where a rate check came from.
alter table public.rate_checks
  add column if not exists invite_id     uuid references public.rate_check_invites(id) on delete set null,
  add column if not exists producer_id   uuid references auth.users(id) on delete set null,
  add column if not exists producer_name text,
  add column if not exists event_name    text;
create index if not exists rate_checks_event_idx on public.rate_checks (agency_id, event_name) where event_name is not null;

-- Recent event names for the invite form's dropdown.
create or replace view public.rate_check_events
with (security_invoker = true) as
select agency_id, event_name, max(created_at) as last_used_at, count(*) as invites
from public.rate_check_invites
where event_name is not null
group by agency_id, event_name;
grant select on public.rate_check_events to authenticated;

NOTIFY pgrst, 'reload schema';
