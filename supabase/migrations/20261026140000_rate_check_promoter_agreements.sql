-- Rate Check partners: a signed agreement before a partner's link pays, a private
-- portal link for signing and seeing earnings, and a monthly cap on paid households.
--
-- portal_token is a long secret, separate from the public share code, so only the
-- partner (and the agency) can open their portal. Signatures are written only by
-- the rate-check-partner edge function (service role): staff can't set
-- agreement_signed_at or insert agreements themselves.

alter table public.rate_check_promoters
  add column if not exists monthly_cap integer default 40 check (monthly_cap is null or monthly_cap between 1 and 1000),
  add column if not exists portal_token text unique default encode(extensions.gen_random_bytes(24), 'hex'),
  add column if not exists agreement_version text,
  add column if not exists agreement_signed_at timestamptz;
update public.rate_check_promoters set portal_token = encode(extensions.gen_random_bytes(24), 'hex') where portal_token is null;
alter table public.rate_check_promoters alter column portal_token set not null;

create table if not exists public.rate_check_promoter_agreements (
  id              uuid primary key default gen_random_uuid(),
  agency_id       uuid not null references public.agencies(id) on delete cascade,
  promoter_id     uuid not null references public.rate_check_promoters(id) on delete cascade,
  version         text not null,
  agreement_text  text not null,               -- exactly what they saw, pay schedule included
  signed_name     text not null check (length(btrim(signed_name)) between 3 and 120),
  signed_at       timestamptz not null default now(),
  ip_address      text,
  user_agent      text
);
create index if not exists rate_check_promoter_agreements_promoter_idx on public.rate_check_promoter_agreements (promoter_id, signed_at desc);

alter table public.rate_check_promoter_agreements enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_promoter_agreements' and policyname = 'rate_check_promoter_agreements_select') then
    create policy rate_check_promoter_agreements_select on public.rate_check_promoter_agreements
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
end $$;
revoke all on public.rate_check_promoter_agreements from anon, authenticated;
grant select on public.rate_check_promoter_agreements to authenticated;

-- Staff may edit a partner's details, but not the signature fields or the token.
revoke insert, update on public.rate_check_promoters from authenticated;
grant insert (agency_id, name, phone, email, notes, monthly_cap, created_by) on public.rate_check_promoters to authenticated;
grant update (name, phone, email, active, w9_received_at, notes, monthly_cap) on public.rate_check_promoters to authenticated;

comment on column public.rate_check_promoters.portal_token is 'Secret for the partner portal (/partner/TOKEN): sign the agreement, see earnings. Not the public share code.';
comment on column public.rate_check_promoters.agreement_signed_at is 'When the current agreement was signed; the share link only tags scans once this is set.';
comment on column public.rate_check_promoters.monthly_cap is 'Most households paid per month; extra households are listed but not paid. Null = no cap.';
comment on table public.rate_check_promoter_agreements is 'Every partner agreement signed, with the text they saw.';

notify pgrst, 'reload schema';
