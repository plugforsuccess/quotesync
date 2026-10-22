-- Commercial is a line the agency writes, so the scanner should name it instead
-- of filing it under "other", and no starter rule should send it away.
--   commercial_auto  — business vehicles
--   commercial       — BOP / general liability / commercial property / workers' comp

alter table public.rate_checks drop constraint if exists rate_checks_policy_type_check;
alter table public.rate_checks add constraint rate_checks_policy_type_check
  check (policy_type in ('auto','home','renters','condo','umbrella','commercial_auto','commercial','other'));

alter table public.rate_check_rules drop constraint if exists rate_check_rules_line_chk;
alter table public.rate_check_rules add constraint rate_check_rules_line_chk
  check (line is null or line in ('auto','home','renters','condo','umbrella','commercial_auto','commercial','other'));

-- The "refer anything else" starter rule assumed Allstate wouldn't write it. Gone.
delete from public.rate_check_rules where name = 'Not a line we write here' and field = 'policy_type' and decision = 'refer';

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
    (p_agency_id, 10, 'High-value home',         'home', 'dwelling',        'gt',  1000000, null, 'expanded_market', 'Chubb', 'Dwelling limit is over the Allstate cutoff'),
    (p_agency_id, 20, 'High home liability',     'home', 'home_liability',  'gte', 500000,  null, 'umbrella',        null,    'Liability this high usually means an umbrella'),
    (p_agency_id, 30, 'Auto liability 250/500+', 'auto', 'bi_per_accident', 'gte', 500000,  null, 'umbrella',        null,    'Offer an umbrella with the auto quote'),
    (p_agency_id, 40, 'More than 3 cars',        'auto', 'vehicle_count',   'gt',  3,       null, 'double_check',    null,    'Confirm every car and driver before quoting'),
    (p_agency_id, 50, 'Umbrella on its own',     'umbrella', 'policy_type', 'eq',  null,   'umbrella', 'double_check', null,  'Needs the underlying auto and home too');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Questions a commercial dec page can't answer. (Whole function re-stated so the
-- CASE is complete; logic otherwise unchanged from 20261023120000.)
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
  rank int := 1;
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
      reasons := reasons || jsonb_build_object('name', 'No liability limits on the page', 'detail', 'Needed for the umbrella check.', 'decision', 'manual_review');
    end if;
  end if;

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
      else case when umbrella then 'quote_allstate_umbrella' else 'quote_allstate' end end,
    'carrier', case when rank = 5 then carrier else null end,
    'reasons', reasons,
    'questions', questions);
end;
$$;

-- Re-run on anything that was filed as "other" or had the refer rule applied.
update public.rate_checks set decided_at = null where status <> 'pending' and (policy_type = 'other' or decision = 'refer');

NOTIFY pgrst, 'reload schema';
