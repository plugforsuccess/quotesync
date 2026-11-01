-- Partner payout rules, editable per agency from Rate Checks → Partners, and the
-- "quote ready, reply Y for a call" handshake that can gate partner pay.
--
-- rate_check_partner_rules (one row per agency; no row = the defaults below):
--   require_call_confirm  a household pays only after the customer replies Y to the
--                         quote-ready text (rate_checks.call_confirmed_at)
--   quote_days            when Y isn't required: pays once quoted, or after this many days
--   expired_days          a dec page expired longer ago than this doesn't count
--   min_payout            months under this carry over to the next payout
--
-- rate_checks.quote_ready_texted_at  when rate-check-outcome texted "your quote is ready"
-- rate_checks.call_confirmed_at      when the customer replied Y (twilio-sms-inbound)

create table if not exists public.rate_check_partner_rules (
  agency_id            uuid primary key references public.agencies(id) on delete cascade,
  require_call_confirm boolean not null default true,
  quote_days           integer not null default 7 check (quote_days between 0 and 90),
  expired_days         integer not null default 30 check (expired_days between 0 and 365),
  min_payout           numeric(8,2) not null default 50 check (min_payout >= 0 and min_payout <= 10000),
  updated_at           timestamptz not null default now(),
  updated_by           uuid references auth.users(id) on delete set null
);

alter table public.rate_checks
  add column if not exists quote_ready_texted_at timestamptz,
  add column if not exists call_confirmed_at timestamptz;

alter table public.rate_check_partner_rules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_partner_rules' and policyname = 'rate_check_partner_rules_select') then
    create policy rate_check_partner_rules_select on public.rate_check_partner_rules for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_partner_rules' and policyname = 'rate_check_partner_rules_manage') then
    create policy rate_check_partner_rules_manage on public.rate_check_partner_rules for all to authenticated
      using (agency_id in (select m.agency_id from public.agency_memberships m
             where m.user_id = auth.uid() and m.status = 'active' and m.agency_role in ('owner','principal','manager')))
      with check (agency_id in (select m.agency_id from public.agency_memberships m
             where m.user_id = auth.uid() and m.status = 'active' and m.agency_role in ('owner','principal','manager')));
  end if;
end $$;

revoke all on public.rate_check_partner_rules from anon;
grant select, insert, update, delete on public.rate_check_partner_rules to authenticated;

NOTIFY pgrst, 'reload schema';
