-- People asking to become referral partners from the Drivers Ed page. Written by the
-- rate-check-partner edge function (mode 'apply', rate limited); the agency reviews them
-- in Rate Checks → Partners and adds them (status 'added', promoter_id) or dismisses them.

create table if not exists public.rate_check_partner_applications (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  first_name  text not null,
  last_name   text,
  phone       text not null,
  email       text,
  is_customer text check (is_customer is null or is_customer in ('yes', 'no')),
  audience    text,
  source      text not null default 'drivers_ed',
  status      text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  promoter_id uuid references public.rate_check_promoters(id) on delete set null,
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists rate_check_partner_applications_agency_idx on public.rate_check_partner_applications (agency_id, status, created_at desc);

alter table public.rate_check_partner_applications enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_partner_applications' and policyname = 'rcpa_select') then
    create policy rcpa_select on public.rate_check_partner_applications for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_partner_applications' and policyname = 'rcpa_update') then
    create policy rcpa_update on public.rate_check_partner_applications for update to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end $$;
revoke all on public.rate_check_partner_applications from anon, authenticated;
grant select (id, agency_id, first_name, last_name, phone, email, is_customer, audience, source, status, promoter_id, created_at) on public.rate_check_partner_applications to authenticated;
grant update (status, promoter_id) on public.rate_check_partner_applications to authenticated;

NOTIFY pgrst, 'reload schema';
