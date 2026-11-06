-- Producer Command Center, step 1: quotes and binds producers log, and the floors
-- they're measured against.
--
--   sales_quotes  one row per quote presented (products + quoted premium). Open until
--                 Bound or Lost; open quotes older than 30 days close as "No response".
--   sales_binds   one row per household bind: bound premium (what the customer paid,
--                 which can be less than quoted) and the bundle type.
--   bound_items   one row per product on a bind, with its item count (1 auto risk =
--                 1 item, so a 2-car auto policy is 2). Provisional until the Allstate
--                 production report confirms it (later step).
--
-- Credit goes to whoever logs it. Rate Checks feed in automatically: an Allstate quote
-- entered on a Rate Check is a quote, and a Rate Check bound with Allstate is a bind
-- (referrals to partner agencies don't count).
--
-- Lead status follows: a quote moves the lead to Quoted, a bind closes it as Won, and
-- Lost closes it as Lost once nothing else on the lead is open.

-- ── Who's logging ───────────────────────────────────────────────────────────
create or replace function public.employee_for_user(p_agency uuid, p_user uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from employees
  where org_id = p_agency and auth_user_id = p_user
  order by (employment_status = 'active') desc, created_at desc
  limit 1
$$;

create or replace function public.is_agency_manager(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from agency_memberships
    where agency_id = p_agency and user_id = auth.uid() and status = 'active'
      and agency_role in ('principal', 'manager')
  )
$$;

-- Auto + Home or Condo = preferred bundle; auto + any other line = bundle; else mono line.
create or replace function public.bundle_type_for(p_products text[])
returns text language sql immutable as $$
  select case
    when 'auto' = any(p_products) and (p_products && array['home', 'condo']) then 'preferred_bundle'
    when 'auto' = any(p_products) and exists (select 1 from unnest(p_products) x where x <> 'auto') then 'bundle'
    else 'mono_line'
  end
$$;

-- ── Tables ──────────────────────────────────────────────────────────────────
create table if not exists public.sales_quotes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  logged_by uuid default auth.uid(),
  lead_id uuid references public.leads(id) on delete set null,
  rate_check_id uuid unique references public.rate_checks(id) on delete cascade,
  customer_name text,
  quoted_on date not null default ((now() at time zone 'America/New_York')::date),
  products text[] not null check (cardinality(products) >= 1),
  quoted_premium numeric check (quoted_premium is null or quoted_premium >= 0),
  status text not null default 'open' check (status in ('open', 'bound', 'lost')),
  lost_reason text check (lost_reason in ('price', 'no_response', 'not_eligible')),
  auto_closed boolean not null default false,
  closed_at timestamptz,
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'lost' or lost_reason is not null)
);
create index if not exists sales_quotes_agency_day on public.sales_quotes (agency_id, quoted_on);
create index if not exists sales_quotes_employee_day on public.sales_quotes (employee_id, quoted_on);
create index if not exists sales_quotes_lead on public.sales_quotes (lead_id);
create index if not exists sales_quotes_open on public.sales_quotes (agency_id) where status = 'open';

create table if not exists public.sales_binds (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  logged_by uuid default auth.uid(),
  lead_id uuid references public.leads(id) on delete set null,
  quote_id uuid references public.sales_quotes(id) on delete set null,
  customer_name text,
  bound_on date not null default ((now() at time zone 'America/New_York')::date),
  bound_premium numeric check (bound_premium is null or bound_premium >= 0),
  bundle_type text not null default 'mono_line' check (bundle_type in ('preferred_bundle', 'bundle', 'mono_line')),
  bundle_type_overridden boolean not null default false,
  source text not null default 'producer' check (source in ('producer', 'rate_check', 'carrier')),
  is_test boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sales_binds_agency_day on public.sales_binds (agency_id, bound_on);
create index if not exists sales_binds_employee_day on public.sales_binds (employee_id, bound_on);
create index if not exists sales_binds_lead on public.sales_binds (lead_id);

create table if not exists public.bound_items (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  bind_id uuid not null references public.sales_binds(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete set null,
  product text not null,
  item_count integer not null default 1 check (item_count >= 1),
  policy_number text,
  prior_policy_items integer,
  rate_check_id uuid unique references public.rate_checks(id) on delete cascade,
  confirmed boolean not null default false,
  confirmed_at timestamptz,
  production_upload_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists bound_items_bind on public.bound_items (bind_id);
create index if not exists bound_items_employee on public.bound_items (employee_id);

-- Agency-wide floors and targets (Schedule B). A producer's own saved goal in
-- producer_performance_targets (vc_items_monthly) overrides target_items for them.
create table if not exists public.producer_floor_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  floor_items integer not null default 20,
  target_items integer not null default 30,
  calls_floor integer not null default 60,
  talk_floor_sec integer not null default 10800,
  quotes_floor integer not null default 8,
  pace_weight numeric not null default 0.4,
  pipeline_weight numeric not null default 0.6,
  updated_at timestamptz not null default now()
);
insert into public.producer_floor_settings (agency_id)
  select id from public.agencies on conflict do nothing;

alter table public.producer_performance_targets add column if not exists is_test boolean not null default false;
update public.producer_performance_targets set is_test = true
  where employee_user_id in (select id from public.profiles where full_name = 'John Doe');

-- ── Fill in who, and keep the bundle type and updated_at current ────────────
create or replace function public.sales_fill_employee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id is null and new.logged_by is not null then
    new.employee_id := employee_for_user(new.agency_id, new.logged_by);
  end if;
  if tg_op = 'UPDATE' then new.updated_at := now(); end if;
  return new;
end $$;

drop trigger if exists sales_quotes_fill on public.sales_quotes;
create trigger sales_quotes_fill before insert or update on public.sales_quotes
  for each row execute function public.sales_fill_employee();
drop trigger if exists sales_binds_fill on public.sales_binds;
create trigger sales_binds_fill before insert or update on public.sales_binds
  for each row execute function public.sales_fill_employee();

create or replace function public.bound_items_fill()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.employee_id is null then
    select employee_id into new.employee_id from sales_binds where id = new.bind_id;
  end if;
  return new;
end $$;
drop trigger if exists bound_items_fill on public.bound_items;
create trigger bound_items_fill before insert on public.bound_items
  for each row execute function public.bound_items_fill();

-- Recompute a bind's bundle type from its products, unless someone chose it by hand.
create or replace function public.sales_bind_rebundle()
returns trigger language plpgsql security definer set search_path = public as $$
declare b uuid := coalesce(new.bind_id, old.bind_id);
begin
  update sales_binds sb set bundle_type = bundle_type_for(coalesce(
      (select array_agg(distinct product) from bound_items where bind_id = b), array[]::text[]))
  where sb.id = b and not sb.bundle_type_overridden;
  return null;
end $$;
drop trigger if exists bound_items_rebundle on public.bound_items;
create trigger bound_items_rebundle after insert or update or delete on public.bound_items
  for each row execute function public.sales_bind_rebundle();

-- ── Lead status follows the quotes and binds ────────────────────────────────
-- "quoted" is in the lead_status enum but the table's check rule left it out, so
-- nothing could set it (the lead page's Quoted button failed too). Allow it.
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check check (status = any (array[
  'partial', 'new', 'contacted', 'interested', 'qualified', 'quoted', 'closed_won', 'closed_lost']::lead_status[]));
-- And the close reasons a bind or a lost quote writes.
alter table public.leads drop constraint if exists leads_disposition_reason_check;
alter table public.leads add constraint leads_disposition_reason_check check (disposition_reason = any (array[
  'not_interested', 'unreachable', 'bad_risk', 'wrong_territory', 'already_insured_elsewhere', 'quoted_in_lm', 'other',
  'bound', 'lost_price', 'lost_no_response', 'lost_not_eligible']));
create or replace function public.sales_sync_lead(p_lead uuid)
returns void language plpgsql security definer set search_path = public as $$
declare open_q int; binds int; lost_q record;
begin
  if p_lead is null then return; end if;
  select count(*) into binds from sales_binds where lead_id = p_lead;
  select count(*) into open_q from sales_quotes where lead_id = p_lead and status = 'open';
  if binds > 0 then
    update leads set status = 'closed_won', disposition_reason = 'bound',
      disposed_at = coalesce(disposed_at, now()) where id = p_lead and status <> 'closed_won';
  elsif open_q > 0 then
    update leads set status = 'quoted' where id = p_lead and status <> 'quoted';
  else
    select lost_reason into lost_q from sales_quotes where lead_id = p_lead and status = 'lost'
      order by closed_at desc nulls last limit 1;
    if found then
      update leads set status = 'closed_lost', disposition_reason = 'lost_' || lost_q.lost_reason,
        disposed_at = now() where id = p_lead and status <> 'closed_lost';
    end if;
  end if;
end $$;

create or replace function public.sales_after_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform sales_sync_lead(coalesce(new.lead_id, old.lead_id));
  if tg_op = 'UPDATE' and old.lead_id is distinct from new.lead_id then perform sales_sync_lead(old.lead_id); end if;
  return null;
end $$;
drop trigger if exists sales_quotes_lead on public.sales_quotes;
create trigger sales_quotes_lead after insert or update or delete on public.sales_quotes
  for each row execute function public.sales_after_change();
drop trigger if exists sales_binds_lead on public.sales_binds;
create trigger sales_binds_lead after insert or update or delete on public.sales_binds
  for each row execute function public.sales_after_change();

-- ── Rate Checks feed in ─────────────────────────────────────────────────────
create or replace function public.rate_check_to_sales()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  product text := coalesce(new.policy_type, 'auto');
  items int := case when coalesce(new.policy_type, 'auto') = 'auto' then greatest(coalesce(new.vehicle_count, 1), 1) else 1 end;
  q uuid; b uuid; day date;
begin
  if coalesce(new.is_test, false) then return null; end if;

  -- An Allstate quote on the Rate Check is a quote, credited to whoever entered it.
  if new.allstate_premium is not null and new.quoted_at is not null then
    insert into sales_quotes (agency_id, logged_by, lead_id, rate_check_id, customer_name, quoted_on, products, quoted_premium)
    values (new.agency_id, new.quoted_by, new.lead_id, new.id, new.first_name,
            (new.quoted_at at time zone 'America/New_York')::date, array[product], new.allstate_premium)
    on conflict (rate_check_id) do update set
      quoted_premium = excluded.quoted_premium, lead_id = excluded.lead_id, products = excluded.products;
  elsif tg_op = 'UPDATE' and old.allstate_premium is not null and new.allstate_premium is null then
    delete from sales_quotes where rate_check_id = new.id and status = 'open';
  end if;
  select id into q from sales_quotes where rate_check_id = new.id;

  -- Bound with Allstate is a bind. One household's Rate Checks bound the same day
  -- share a bind, so Auto + Home reads as a preferred bundle.
  if new.bound_at is not null and new.bound_carrier ilike '%allstate%' then
    if not exists (select 1 from bound_items where rate_check_id = new.id) then
      day := (new.bound_at at time zone 'America/New_York')::date;
      if new.lead_id is not null then
        select id into b from sales_binds
          where lead_id = new.lead_id and bound_on = day and source = 'rate_check' limit 1;
      end if;
      if b is null then
        insert into sales_binds (agency_id, logged_by, lead_id, quote_id, customer_name, bound_on, bound_premium, source)
        values (new.agency_id, new.bound_by, new.lead_id, q, new.first_name, day, new.bound_premium, 'rate_check')
        returning id into b;
      else
        update sales_binds set bound_premium = coalesce(bound_premium, 0) + coalesce(new.bound_premium, 0) where id = b;
      end if;
      insert into bound_items (agency_id, bind_id, product, item_count, prior_policy_items, rate_check_id, policy_number)
      values (new.agency_id, b, product, items, items, new.id, null);
    end if;
    update sales_quotes set status = 'bound', closed_at = coalesce(closed_at, now()), lost_reason = null
      where id = q and status <> 'bound';
  elsif tg_op = 'UPDATE' and exists (select 1 from bound_items where rate_check_id = new.id) then
    -- Unbound, or bound elsewhere after all: take it back out.
    select bind_id into b from bound_items where rate_check_id = new.id;
    delete from bound_items where rate_check_id = new.id;
    update sales_binds set bound_premium = greatest(coalesce(bound_premium, 0) - coalesce(old.bound_premium, 0), 0) where id = b;
    delete from sales_binds sb where sb.id = b and not exists (select 1 from bound_items where bind_id = b);
    update sales_quotes set status = 'open', closed_at = null where id = q and status = 'bound';
  end if;
  return null;
end $$;
drop trigger if exists rate_checks_to_sales on public.rate_checks;
create trigger rate_checks_to_sales after insert or update of allstate_premium, quoted_at, bound_at, bound_carrier, bound_premium, lead_id, vehicle_count, policy_type
  on public.rate_checks for each row execute function public.rate_check_to_sales();

-- ── Open quotes older than 30 days close as "No response" (daily, 3 am ET) ──
create or replace function public.sales_close_stale_quotes()
returns integer language sql security definer set search_path = public as $$
  with closed as (
    update sales_quotes set status = 'lost', lost_reason = 'no_response', auto_closed = true, closed_at = now()
    where status = 'open' and quoted_on < ((now() at time zone 'America/New_York')::date - 30)
    returning 1
  ) select count(*)::int from closed
$$;
do $$ begin
  perform cron.unschedule('sales-close-stale-quotes') from cron.job where jobname = 'sales-close-stale-quotes';
  perform cron.schedule('sales-close-stale-quotes', '0 8 * * *', 'select public.sales_close_stale_quotes()');
end $$;

-- ── Row level security ──────────────────────────────────────────────────────
-- Principals and managers see the whole agency; everyone else sees and edits only
-- their own quotes and binds.
alter table public.sales_quotes enable row level security;
alter table public.sales_binds enable row level security;
alter table public.bound_items enable row level security;
alter table public.producer_floor_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['sales_quotes', 'sales_binds', 'bound_items'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format($p$create policy %1$s_read on public.%1$s for select to authenticated using (
      agency_id in (select get_user_agency_ids()) and (
        is_agency_manager(agency_id)
        or employee_id = employee_for_user(agency_id, auth.uid())))$p$, t);
    execute format($p$create policy %1$s_write on public.%1$s for all to authenticated using (
      agency_id in (select get_user_agency_ids()) and (
        is_agency_manager(agency_id)
        or employee_id = employee_for_user(agency_id, auth.uid())))
      with check (agency_id in (select get_user_agency_ids()) and (
        is_agency_manager(agency_id)
        or employee_id is null
        or employee_id = employee_for_user(agency_id, auth.uid())))$p$, t);
  end loop;
end $$;

drop policy if exists producer_floor_settings_read on public.producer_floor_settings;
create policy producer_floor_settings_read on public.producer_floor_settings for select to authenticated
  using (agency_id in (select get_user_agency_ids()));
drop policy if exists producer_floor_settings_write on public.producer_floor_settings;
create policy producer_floor_settings_write on public.producer_floor_settings for all to authenticated
  using (is_agency_manager(agency_id)) with check (is_agency_manager(agency_id));

grant select, insert, update, delete on public.sales_quotes, public.sales_binds, public.bound_items to authenticated;
grant select, insert, update on public.producer_floor_settings to authenticated;

NOTIFY pgrst, 'reload schema';
