-- PUP needs both sides of the household; housing question; Chubb above $4M.
--
-- * "Quote Allstate Auto + HO + PUP" only when the household has an auto policy at
--   250/500+ AND a home policy with $300k+ liability — so both dec pages must be
--   scanned. One side alone gets a "PUP possible — get their other policy" hint.
--   The 'umbrella' rule decision now means "this policy counts toward a PUP".
-- * rate_checks.housing_situation: own / rent / family / retirement, asked on the
--   consumer form (and optional on staff uploads). Usable in rules.
-- * Starter Chubb rule moves to dwelling over $4,000,000.

alter table public.rate_checks add column if not exists housing_situation text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_checks_housing_situation_chk') then
    alter table public.rate_checks add constraint rate_checks_housing_situation_chk
      check (housing_situation is null or housing_situation in ('own','rent','family','retirement'));
  end if;
end $$;

-- Rules can look at housing too.
alter table public.rate_check_rules drop constraint if exists rate_check_rules_field_chk;
alter table public.rate_check_rules add constraint rate_check_rules_field_chk check (field in (
  'dwelling','home_liability','personal_property','bi_per_person','bi_per_accident','pd','um_uim',
  'vehicle_count','driver_count','annual_premium','term_months','carrier','policy_type','zip','housing_situation'
));

-- Starter thresholds per the agency.
update public.rate_check_rules set value_num = 4000000, note = 'Dwelling over $4M goes to Chubb', updated_at = now()
 where name = 'High-value home' and field = 'dwelling' and decision = 'expanded_market';
update public.rate_check_rules set value_num = 300000, name = 'Home liability $300k+', note = 'Counts toward a PUP (needs the auto side too)', updated_at = now()
 where name = 'High home liability' and field = 'home_liability' and decision = 'umbrella';
update public.rate_check_rules set note = 'Counts toward a PUP (needs the home side too)', updated_at = now()
 where name = 'Auto liability 250/500+' and field = 'bi_per_accident' and decision = 'umbrella';

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
    (p_agency_id, 10, 'High-value home',         'home', 'dwelling',        'gt',  4000000, null, 'expanded_market', 'Chubb', 'Dwelling over $4M goes to Chubb'),
    (p_agency_id, 20, 'Home liability $300k+',   'home', 'home_liability',  'gte', 300000,  null, 'umbrella',        null,    'Counts toward a PUP (needs the auto side too)'),
    (p_agency_id, 30, 'Auto liability 250/500+', 'auto', 'bi_per_accident', 'gte', 500000,  null, 'umbrella',        null,    'Counts toward a PUP (needs the home side too)'),
    (p_agency_id, 40, 'More than 3 cars',        'auto', 'vehicle_count',   'gt',  3,       null, 'double_check',    null,    'Confirm every car and driver before quoting'),
    (p_agency_id, 50, 'Umbrella on its own',     'umbrella', 'policy_type', 'eq',  null,   'umbrella', 'double_check', null,  'Needs the underlying auto and home too');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ── Rule evaluation, shared by the decision and the PUP side check ───────────
create or replace function public.rate_check_rule_hit(r public.rate_checks, rule public.rate_check_rules,
  out hit boolean, out v_num numeric, out v_txt text)
language plpgsql
stable
set search_path = public
as $$
declare cov jsonb := coalesce(r.coverages, '{}'::jsonb);
begin
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
    when 'housing_situation' then v_txt := r.housing_situation;
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
end;
$$;

-- Which side of a PUP this policy counts toward, per the agency's 'umbrella'
-- rules: 'auto', 'home', or null.
create or replace function public.rate_check_pup_side(r public.rate_checks)
returns text
language plpgsql
stable
set search_path = public
as $$
declare rule public.rate_check_rules; h record;
begin
  if r.status in ('pending','declined') then return null; end if;
  for rule in
    select * from public.rate_check_rules
    where agency_id = r.agency_id and enabled and decision = 'umbrella'
      and (line is null or line = r.policy_type)
  loop
    h := public.rate_check_rule_hit(r, rule);
    if h.hit then
      return case when r.policy_type in ('auto','commercial_auto') then 'auto'
                  when r.policy_type in ('home','condo') then 'home' end;
    end if;
  end loop;
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
  rule public.rate_check_rules; h record;
  rank int := 1;
  carrier text := null;
  reasons jsonb := '[]'::jsonb;
  questions jsonb;
  fmt text;
  rank_of constant jsonb := '{"double_check":3,"manual_review":4,"expanded_market":5,"refer":6}'::jsonb;
  cov jsonb := coalesce(r.coverages, '{}'::jsonb);
  my_side text; has_auto boolean := false; has_home boolean := false; pup boolean := false;
begin
  if r.status = 'pending' then
    return null;
  end if;

  if r.status = 'extract_failed' then
    rank := 4;
    reasons := reasons || jsonb_build_object('name', 'Couldn’t read the photo', 'detail', 'Fill in the policy by hand, then the rules run again.', 'decision', 'manual_review');
  elsif r.extract_confidence = 'low' then
    rank := greatest(rank, 3);
    reasons := reasons || jsonb_build_object('name', 'Scan wasn’t sure', 'detail', 'Check the numbers against the photo.', 'decision', 'double_check');
  end if;

  if r.status <> 'extract_failed' then
    if r.annual_premium is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No price on the page', 'detail', 'Enter their current premium.', 'decision', 'manual_review');
    end if;
    if r.policy_type = 'home' and public.rc_limit(cov->>'dwelling') is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No dwelling limit on the page', 'detail', 'Needed to tell Allstate from expanded market.', 'decision', 'manual_review');
    end if;
    if r.policy_type in ('auto','commercial_auto')
       and public.rc_limit(cov->>'bi_per_accident', case when position('/' in coalesce(cov->>'bi_per_accident','')) > 0 then 2 else 1 end) is null
       and public.rc_limit(cov->>'bi_per_person') is null
       and public.rc_limit(cov->>'liability') is null then
      rank := greatest(rank, 4);
      reasons := reasons || jsonb_build_object('name', 'No liability limits on the page', 'detail', 'Needed for the PUP check.', 'decision', 'manual_review');
    end if;
  end if;

  for rule in
    select * from public.rate_check_rules
    where agency_id = r.agency_id and enabled
      and (line is null or line = r.policy_type)
    order by priority, created_at
  loop
    h := public.rate_check_rule_hit(r, rule);
    if not h.hit then continue; end if;

    fmt := case
      when rule.field in ('dwelling','home_liability','personal_property','bi_per_person','bi_per_accident','pd','um_uim','annual_premium')
        then '$' || to_char(h.v_num, 'FM999,999,999,999')
      when h.v_num is not null then h.v_num::text
      else h.v_txt end;

    reasons := reasons || jsonb_build_object(
      'name', rule.name,
      'detail', coalesce(rule.note, '') || case when fmt is not null then ' (' || fmt || ')' else '' end,
      'decision', rule.decision);

    if rule.decision <> 'umbrella' then
      if rule.decision = 'expanded_market' and (rank < 5 or carrier is null) then
        carrier := coalesce(carrier, rule.carrier);
      end if;
      rank := greatest(rank, (rank_of->>rule.decision)::int);
    end if;
  end loop;

  -- PUP: needs a qualifying auto AND a qualifying home somewhere in the household.
  my_side := public.rate_check_pup_side(r);
  has_auto := my_side = 'auto'; has_home := my_side = 'home';
  if r.phone is not null then
    select bool_or(public.rate_check_pup_side(s) = 'auto') or has_auto, bool_or(public.rate_check_pup_side(s) = 'home') or has_home
      into has_auto, has_home
      from public.rate_checks s
     where s.agency_id = r.agency_id and s.phone = r.phone and s.id <> r.id and s.status not in ('pending','declined');
    has_auto := coalesce(has_auto, my_side = 'auto'); has_home := coalesce(has_home, my_side = 'home');
  end if;
  if has_auto and has_home then
    pup := true;
    reasons := reasons || jsonb_build_object('name', 'PUP', 'detail', 'Auto at 250/500+ and home with $300k+ liability in this household — quote the umbrella with the bundle.', 'decision', 'umbrella');
  elsif has_auto then
    reasons := reasons || jsonb_build_object('name', 'PUP possible', 'detail', 'Auto qualifies — get their home dec page; a PUP needs $300k+ home liability too.', 'decision', 'info');
  elsif has_home then
    reasons := reasons || jsonb_build_object('name', 'PUP possible', 'detail', 'Home qualifies — get their auto dec page; a PUP needs auto liability at 250/500 or higher too.', 'decision', 'info');
  end if;

  questions := case r.policy_type
    when 'home'            then '["Roof age and when it was last replaced","Year built and construction type","Any claims in the last 5 years","Pool, trampoline or dogs"]'::jsonb
    when 'condo'           then '["Any claims in the last 5 years","Year built"]'::jsonb
    when 'renters'         then '["Any claims in the last 5 years"]'::jsonb
    when 'auto'            then '["Tickets or accidents in the last 3 years","Who drives each car, and how far","Any teen or new drivers"]'::jsonb
    when 'umbrella'        then '["Underlying auto and home limits"]'::jsonb
    when 'commercial_auto' then '["What the vehicles are used for, and radius","Who drives them, and their records","Any claims in the last 5 years"]'::jsonb
    when 'commercial'      then '["What the business does, and annual revenue","Number of employees","Building owned or leased, and square footage","Any claims in the last 5 years"]'::jsonb
    else '[]'::jsonb end;

  return jsonb_build_object(
    'decision', case rank
      when 6 then 'refer'
      when 5 then 'expanded_market'
      when 4 then 'manual_review'
      when 3 then 'double_check'
      else case when pup then 'quote_allstate_umbrella' else 'quote_allstate' end end,
    'carrier', case when rank = 5 then carrier else null end,
    'reasons', reasons,
    'questions', questions);
end;
$$;

-- When one policy changes, the rest of the household re-decides (their PUP
-- status depends on this one). Depth guard stops the cascade at one hop.
create or replace function public.rate_checks_household_after()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 or new.phone is null then return null; end if;
  if tg_op = 'UPDATE' and old.coverages is not distinct from new.coverages
     and old.policy_type is not distinct from new.policy_type and old.status is not distinct from new.status then
    return null;
  end if;
  update public.rate_checks set decided_at = null
   where agency_id = new.agency_id and phone = new.phone and id <> new.id and status <> 'pending';
  return null;
end;
$$;

create or replace trigger rate_checks_household_after
  after insert or update on public.rate_checks
  for each row execute function public.rate_checks_household_after();

-- Re-decide everything open under the new PUP logic.
update public.rate_checks set decided_at = null where status not in ('pending','declined');

NOTIFY pgrst, 'reload schema';
