-- Rate Check routing rules + decision card.
--
-- After a dec page is read, the agency's rules decide where it goes:
--   quote_allstate | quote_allstate_umbrella | expanded_market | double_check | manual_review | refer
-- This is an appetite pre-screen from what a dec page shows (limits, vehicles,
-- premium, carrier) — not underwriting. The card also lists what the page can't
-- answer (roof age, claims...) so the producer asks before quoting.
--
-- The decision is computed in a BEFORE trigger, so it re-runs whenever an agent
-- fixes the extraction, and `rate_check_redecide()` re-runs it for open rate
-- checks after the rules change.

-- ── Rules ────────────────────────────────────────────────────────────────────
create table if not exists public.rate_check_rules (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  priority    int  not null default 100,        -- lower runs first (only matters for carrier pick / display order)
  name        text not null,
  line        text,                              -- null = any; else auto/home/renters/condo/umbrella/other
  field       text not null,
  op          text not null,
  value_num   numeric,
  value_text  text,
  decision    text not null,
  carrier     text,                              -- expanded_market target, e.g. Chubb
  note        text,                              -- shown on the card
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint rate_check_rules_line_chk check (line is null or line in ('auto','home','renters','condo','umbrella','other')),
  constraint rate_check_rules_field_chk check (field in (
    'dwelling','home_liability','personal_property','bi_per_person','bi_per_accident','pd','um_uim',
    'vehicle_count','driver_count','annual_premium','term_months','carrier','policy_type','zip'
  )),
  constraint rate_check_rules_op_chk check (op in ('gt','gte','lt','lte','eq','neq','in','not_in','starts_with','missing')),
  constraint rate_check_rules_decision_chk check (decision in ('umbrella','expanded_market','double_check','manual_review','refer'))
);
create index if not exists rate_check_rules_agency_idx on public.rate_check_rules (agency_id, enabled, priority);

alter table public.rate_check_rules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_rules' and policyname = 'rate_check_rules_select') then
    create policy rate_check_rules_select on public.rate_check_rules
      for select to authenticated
      using ((select public.is_platform_support()) or agency_id in (select public.get_user_agency_ids()));
  end if;
  -- Only principals/owners/managers change the rules.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'rate_check_rules' and policyname = 'rate_check_rules_manage') then
    create policy rate_check_rules_manage on public.rate_check_rules
      for all to authenticated
      using (agency_id in (
        select m.agency_id from public.agency_memberships m
        where m.user_id = auth.uid() and m.status = 'active' and m.agency_role in ('owner','principal','manager')))
      with check (agency_id in (
        select m.agency_id from public.agency_memberships m
        where m.user_id = auth.uid() and m.status = 'active' and m.agency_role in ('owner','principal','manager')));
  end if;
end $$;

revoke all on public.rate_check_rules from anon;
revoke all on public.rate_check_rules from authenticated;
grant select, insert, update, delete on public.rate_check_rules to authenticated;

-- ── Decision columns ─────────────────────────────────────────────────────────
alter table public.rate_checks
  add column if not exists decision           text,
  add column if not exists decision_carrier   text,
  add column if not exists decision_reasons   jsonb,   -- [{name, detail, decision}]
  add column if not exists decision_questions jsonb,   -- ["Roof age", ...] — what the dec page can't tell us
  add column if not exists decided_at         timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_checks_decision_chk') then
    alter table public.rate_checks add constraint rate_checks_decision_chk
      check (decision is null or decision in ('quote_allstate','quote_allstate_umbrella','expanded_market','double_check','manual_review','refer'));
  end if;
end $$;

-- ── Money parser ─────────────────────────────────────────────────────────────
-- Reads a coverage limit as printed: "$100,000", "100,000 each person",
-- "250/500" (thousands), "$1.5M", "500k". p_nth picks the nth number
-- (2 for the per-accident half of "100/300"). Null if nothing numeric.
create or replace function public.rc_limit(p_text text, p_nth int default 1)
returns numeric
language plpgsql
immutable
as $$
declare
  m text[];
  raw text;
  n numeric;
  suffix text;
begin
  if p_text is null then return null; end if;
  select rm into m
    from regexp_matches(p_text, '([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kKmM])?(?![0-9])', 'g') as rm
    offset greatest(p_nth - 1, 0) limit 1;
  if m is null then return null; end if;
  raw := replace(m[1], ',', '');
  suffix := lower(coalesce(m[2], ''));
  n := raw::numeric;
  if suffix = 'k' then n := n * 1000;
  elsif suffix = 'm' then n := n * 1000000;
  elsif n < 1000 and position('$' in p_text) = 0 and position(',' in p_text) = 0 then
    -- "250/500" style limits are in thousands
    n := n * 1000;
  end if;
  return n;
exception when others then
  return null;
end;
$$;

-- ── Decision ─────────────────────────────────────────────────────────────────
create or replace function public.rate_check_decide(r public.rate_checks)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  rule record;
  v_num numeric;
  v_txt text;
  hit boolean;
  rank int := 1;                     -- 1 quote_allstate, 3 double_check, 4 manual_review, 5 expanded, 6 refer
  umbrella boolean := false;
  carrier text := null;
  reasons jsonb := '[]'::jsonb;
  questions jsonb;
  fmt text;
  rank_of constant jsonb := '{"double_check":3,"manual_review":4,"expanded_market":5,"refer":6}'::jsonb;
  cov jsonb := coalesce(r.coverages, '{}'::jsonb);
begin
  if r.status = 'pending' then
    return null;
  end if;

  -- Built-ins: unreadable scan → Manual Review; a shaky scan → Double check.
  if r.status = 'extract_failed' then
    rank := 4;
    reasons := reasons || jsonb_build_object('name', 'Couldn’t read the photo', 'detail', 'Fill in the policy by hand, then the rules run again.', 'decision', 'manual_review');
  elsif r.extract_confidence = 'low' then
    rank := greatest(rank, 3);
    reasons := reasons || jsonb_build_object('name', 'Scan wasn’t sure', 'detail', 'Check the numbers against the photo.', 'decision', 'double_check');
  end if;

  -- Built-ins: what each line needs before we can call it. Missing → Manual Review.
  if r.status <> 'extract_failed' then
    if r.annual_premium is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No price on the page', 'detail', 'Enter their current premium.', 'decision', 'manual_review');
    end if;
    if r.policy_type = 'home' and public.rc_limit(cov->>'dwelling') is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No dwelling limit on the page', 'detail', 'Needed to tell Allstate from expanded market.', 'decision', 'manual_review');
    end if;
    if r.policy_type = 'auto' and public.rc_limit(cov->>'bi_per_accident', case when position('/' in coalesce(cov->>'bi_per_accident','')) > 0 then 2 else 1 end) is null
       and public.rc_limit(cov->>'bi_per_person') is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No liability limits on the page', 'detail', 'Needed for the umbrella check.', 'decision', 'manual_review');
    end if;
  end if;

  -- Agency rules.
  for rule in
    select * from public.rate_check_rules
    where agency_id = r.agency_id and enabled
      and (line is null or line = r.policy_type)
    order by priority, created_at
  loop
    v_num := null; v_txt := null;
    case rule.field
      when 'dwelling'          then v_num := public.rc_limit(cov->>'dwelling');
      when 'home_liability'    then v_num := public.rc_limit(cov->>'liability');
      when 'personal_property' then v_num := public.rc_limit(cov->>'personal_property');
      when 'bi_per_person'     then v_num := public.rc_limit(cov->>'bi_per_person');
      when 'bi_per_accident'   then v_num := public.rc_limit(cov->>'bi_per_accident',
                                       case when position('/' in coalesce(cov->>'bi_per_accident','')) > 0 then 2 else 1 end);
      when 'pd'                then v_num := public.rc_limit(cov->>'pd');
      when 'um_uim'            then v_num := public.rc_limit(cov->>'um_uim');
      when 'vehicle_count'     then v_num := r.vehicle_count;
      when 'driver_count'      then v_num := r.driver_count;
      when 'annual_premium'    then v_num := r.annual_premium;
      when 'term_months'       then v_num := r.term_months;
      when 'carrier'           then v_txt := r.carrier;
      when 'policy_type'       then v_txt := r.policy_type;
      when 'zip'               then v_txt := r.zip;
      else null;
    end case;

    hit := case rule.op
      when 'missing'     then v_num is null and v_txt is null
      when 'gt'          then v_num is not null and v_num >  rule.value_num
      when 'gte'         then v_num is not null and v_num >= rule.value_num
      when 'lt'          then v_num is not null and v_num <  rule.value_num
      when 'lte'         then v_num is not null and v_num <= rule.value_num
      when 'eq'          then coalesce(v_num = rule.value_num, lower(v_txt) = lower(rule.value_text), false)
      when 'neq'         then coalesce(v_num <> rule.value_num, lower(v_txt) <> lower(rule.value_text), false)
      when 'in'          then v_txt is not null and lower(v_txt) = any (select lower(trim(x)) from unnest(string_to_array(coalesce(rule.value_text,''), ',')) x)
      when 'not_in'      then v_txt is not null and not (lower(v_txt) = any (select lower(trim(x)) from unnest(string_to_array(coalesce(rule.value_text,''), ',')) x))
      when 'starts_with' then v_txt is not null and v_txt like coalesce(rule.value_text,'') || '%'
      else false end;

    if not hit then continue; end if;

    fmt := case
      when rule.field in ('dwelling','home_liability','personal_property','bi_per_person','bi_per_accident','pd','um_uim','annual_premium')
        then '$' || to_char(v_num, 'FM999,999,999,999')
      when v_num is not null then v_num::text
      else v_txt end;

    reasons := reasons || jsonb_build_object(
      'name', rule.name,
      'detail', coalesce(rule.note, '') || case when fmt is not null then ' (' || fmt || ')' else '' end,
      'decision', rule.decision);

    if rule.decision = 'umbrella' then
      umbrella := true;
    else
      if rule.decision = 'expanded_market' and (rank < 5 or carrier is null) then
        carrier := coalesce(carrier, rule.carrier);
      end if;
      rank := greatest(rank, (rank_of->>rule.decision)::int);
    end if;
  end loop;

  questions := case r.policy_type
    when 'home'    then '["Roof age and when it was last replaced","Year built and construction type","Any claims in the last 5 years","Pool, trampoline or dogs"]'::jsonb
    when 'condo'   then '["Any claims in the last 5 years","Year built"]'::jsonb
    when 'renters' then '["Any claims in the last 5 years"]'::jsonb
    when 'auto'    then '["Tickets or accidents in the last 3 years","Who drives each car, and how far","Any teen or new drivers"]'::jsonb
    when 'umbrella' then '["Underlying auto and home limits"]'::jsonb
    else '[]'::jsonb end;

  return jsonb_build_object(
    'decision', case rank
      when 6 then 'refer'
      when 5 then 'expanded_market'
      when 4 then 'manual_review'
      when 3 then 'double_check'
      else case when umbrella then 'quote_allstate_umbrella' else 'quote_allstate' end end,
    'carrier', case when rank = 5 then carrier else null end,
    'reasons', reasons,
    'questions', questions);
end;
$$;

-- Trigger: recompute on insert and on every update (cheap, and keeps the card
-- honest after "Fix details"). Runs after rate_checks_before_update (alphabetical).
create or replace function public.rate_checks_decide_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare d jsonb;
begin
  d := public.rate_check_decide(new);
  if d is null then
    new.decision := null; new.decision_carrier := null; new.decision_reasons := null;
    new.decision_questions := null; new.decided_at := null;
  else
    new.decision := d->>'decision';
    new.decision_carrier := d->>'carrier';
    new.decision_reasons := d->'reasons';
    new.decision_questions := d->'questions';
    new.decided_at := now();
  end if;
  return new;
end;
$$;

create or replace trigger rate_checks_decide
  before insert or update on public.rate_checks
  for each row execute function public.rate_checks_decide_trigger();

-- Re-run the rules on an agency's open rate checks (after editing rules).
-- Security invoker: RLS limits it to the caller's agencies.
create or replace function public.rate_check_redecide(p_agency_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare n int;
begin
  update public.rate_checks set decided_at = null
   where agency_id = p_agency_id and status in ('extracted','extract_failed','quoted');
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.rate_check_redecide(uuid) to authenticated;

-- ── Default rules ────────────────────────────────────────────────────────────
-- Thresholds are placeholders for the agency to tune in the Rules tab.
create or replace function public.rate_check_rules_seed(p_agency_id uuid)
returns int
language plpgsql
set search_path = public
as $$
declare n int;
begin
  if exists (select 1 from public.rate_check_rules where agency_id = p_agency_id) then
    return 0;
  end if;
  insert into public.rate_check_rules (agency_id, priority, name, line, field, op, value_num, value_text, decision, carrier, note) values
    (p_agency_id, 10, 'High-value home',            'home', 'dwelling',        'gt',  1000000, null, 'expanded_market', 'Chubb', 'Dwelling limit is over the Allstate cutoff'),
    (p_agency_id, 20, 'High home liability',        'home', 'home_liability',  'gte', 500000,  null, 'umbrella',        null,    'Liability this high usually means an umbrella'),
    (p_agency_id, 30, 'Auto liability 250/500+',    'auto', 'bi_per_accident', 'gte', 500000,  null, 'umbrella',        null,    'Offer an umbrella with the auto quote'),
    (p_agency_id, 40, 'More than 3 cars',           'auto', 'vehicle_count',   'gt',  3,       null, 'double_check',    null,    'Confirm every car and driver before quoting'),
    (p_agency_id, 50, 'Umbrella on its own',        'umbrella', 'policy_type', 'eq',  null,   'umbrella', 'double_check', null,  'Needs the underlying auto and home too'),
    (p_agency_id, 90, 'Not a line we write here',   'other', 'policy_type',    'eq',  null,   'other',    'refer',       null,    'Take their number and refer');
  get diagnostics n = row_count;
  return n;
end;
$$;
grant execute on function public.rate_check_rules_seed(uuid) to authenticated;

do $$
declare a record;
begin
  for a in select id from public.agencies loop
    perform public.rate_check_rules_seed(a.id);
  end loop;
end $$;

-- Decide everything that's already in the inbox.
update public.rate_checks set decided_at = null where status <> 'pending';

NOTIFY pgrst, 'reload schema';
