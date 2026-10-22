-- Rate Check (dec-page scanner)
--
-- A consumer snaps a photo of their current declarations page on
-- insuredbycam.com/ratecheck. The `rate-check` edge function stores the image
-- in the private `dec-pages` bucket, extracts the policy with Claude, and
-- writes one row here (plus a lead). An agent then enters the Allstate quote;
-- the trigger below computes won/lost from the generated delta.
--
-- Inserts from the public page go through the edge function with the service
-- role — there is deliberately NO anon policy on this table.

create table if not exists public.rate_checks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  lead_id uuid references public.leads(id) on delete set null,
  session_id text,
  first_name text,
  phone text,
  zip text,
  consent_given_at timestamptz,
  consent_ip text,
  consent_version text,
  consent_user_agent text,
  image_path text,
  image_media_type text,
  status text not null default 'pending'
    check (status in ('pending','extracted','extract_failed','quoted','won','lost','declined')),
  extracted jsonb,
  extract_confidence text check (extract_confidence in ('high','medium','low')),
  extract_error text,
  extracted_at timestamptz,
  carrier text,
  policy_type text check (policy_type in ('auto','home','renters','condo','umbrella','other')),
  policy_number_last4 text,
  current_premium numeric(10,2),
  term_months int,
  annual_premium numeric(10,2),
  effective_date date,
  expiration_date date,
  vehicle_count int,
  driver_count int,
  vehicles jsonb,
  coverages jsonb,
  insured_address text,
  allstate_premium numeric(10,2),
  -- Positive delta = the consumer saves money by switching to Allstate.
  delta numeric(10,2) generated always as (annual_premium - allstate_premium) stored,
  delta_pct numeric(6,2) generated always as (
    case when annual_premium is null or annual_premium = 0 or allstate_premium is null then null
         else round((annual_premium - allstate_premium) / annual_premium * 100, 2) end) stored,
  quoted_at timestamptz,
  quoted_by uuid references auth.users(id),
  quote_note text,
  outcome_at timestamptz,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  landing_page text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_checks_agency_status_created_idx
  on public.rate_checks(agency_id, status, created_at desc);
create index if not exists rate_checks_phone_idx on public.rate_checks(phone);
create index if not exists rate_checks_carrier_zip_idx on public.rate_checks(carrier, zip);
create index if not exists rate_checks_lead_idx on public.rate_checks(lead_id);
-- Retention sweep looks for old rows that still have an image.
create index if not exists rate_checks_image_created_idx
  on public.rate_checks(created_at) where image_path is not null;

-- ── Trigger: updated_at + won/lost from the Allstate quote ────────────────────
-- Re-evaluates whenever the Allstate premium is (re)entered, or the current
-- premium is corrected after a quote exists. 'declined' is terminal and never
-- overwritten. (extract_failed / won / lost are included so an agent can fill
-- in a failed extraction by hand, or re-quote, and still get an outcome.)
create or replace function public.rate_checks_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();

  if new.allstate_premium is not null
     and (new.allstate_premium is distinct from old.allstate_premium
          or new.annual_premium is distinct from old.annual_premium)
     and new.status in ('pending','extracted','extract_failed','quoted','won','lost') then
    new.quoted_at := coalesce(new.quoted_at, now());
    if new.annual_premium is null then
      new.status := 'quoted';
    elsif new.annual_premium > new.allstate_premium then
      new.status := 'won';
    else
      new.status := 'lost';
    end if;
    new.outcome_at := now();
  end if;

  return new;
end;
$$;

create or replace trigger rate_checks_before_update
  before update on public.rate_checks
  for each row execute function public.rate_checks_before_update();

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.rate_checks enable row level security;

-- Policies are created only if missing (keeps the migration re-runnable
-- without DROP statements).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_checks' and policyname = 'rate_checks_select') then
    create policy rate_checks_select on public.rate_checks
      for select to authenticated
      using (
        (select public.is_platform_support())
        or agency_id in (select public.get_user_agency_ids())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_checks' and policyname = 'rate_checks_update') then
    create policy rate_checks_update on public.rate_checks
      for update to authenticated
      using (agency_id in (select public.get_user_agency_ids()))
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_checks' and policyname = 'rate_checks_insert') then
    create policy rate_checks_insert on public.rate_checks
      for insert to authenticated
      with check (agency_id in (select public.get_user_agency_ids()));
  end if;
end
$$;

grant select, insert, update on public.rate_checks to authenticated;

-- Realtime for the Rate Checks inbox (RLS still applies to change events).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rate_checks'
     ) then
    alter publication supabase_realtime add table public.rate_checks;
  end if;
end
$$;

-- ── Storage: private dec-pages bucket ────────────────────────────────────────
-- Objects live at <agency_id>/<rate_check_id>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dec-pages', 'dec-pages', false, 15728640,
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dec_pages_select_agency') then
    create policy dec_pages_select_agency on storage.objects
      for select to authenticated
      using (
        bucket_id = 'dec-pages'
        and (storage.foldername(name))[1] in (select public.get_user_agency_ids()::text)
      );
  end if;
end
$$;

-- ── Win map ──────────────────────────────────────────────────────────────────
-- security_invoker so the view runs under the caller's RLS on rate_checks.
create or replace view public.rate_check_win_map
with (security_invoker = true) as
select
  agency_id,
  carrier,
  policy_type,
  left(zip, 5) as zip5,
  count(*) filter (where status in ('won','lost')) as quoted,
  count(*) filter (where status = 'won') as wins,
  round(
    100.0 * count(*) filter (where status = 'won')
      / nullif(count(*) filter (where status in ('won','lost')), 0),
    1
  ) as win_rate_pct,
  round(avg(delta) filter (where status = 'won'), 2) as avg_savings_when_won
from public.rate_checks
group by agency_id, carrier, policy_type, left(zip, 5);

grant select on public.rate_check_win_map to authenticated;

-- ── Feature flag: Rate Checks inbox for the default agency ───────────────────
insert into public.feature_permissions (agency_id, feature_key, enabled, min_role)
select id, 'rate_checks', true, 'producer'
from public.agencies
where is_default = true
on conflict (agency_id, feature_key) do update set enabled = true;

NOTIFY pgrst, 'reload schema';
