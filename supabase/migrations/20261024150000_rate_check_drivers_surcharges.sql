-- The scan now reads what dec pages often print about the people and the
-- record: listed/excluded drivers, vehicle usage and mileage, surcharges
-- (accidents, violations) and claims. When the page answers one of the
-- "ask before quoting" questions, the card shows the answer instead.

alter table public.rate_checks
  add column if not exists drivers    jsonb,   -- [{name, age, status, usage}]
  add column if not exists surcharges jsonb,   -- ["Accident surcharge 03/2024", ...]
  add column if not exists claims     jsonb;   -- ["Hail claim 06/2023 $4,200", ...]

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
  questions jsonb := '[]'::jsonb;
  fmt text;
  rank_of constant jsonb := '{"double_check":3,"manual_review":4,"expanded_market":5,"refer":6}'::jsonb;
  cov jsonb := coalesce(r.coverages, '{}'::jsonb);
  my_side text; has_auto boolean := false; has_home boolean := false; pup boolean := false;
  n_surch int := coalesce(jsonb_array_length(case when jsonb_typeof(r.surcharges) = 'array' then r.surcharges end), 0);
  n_claims int := coalesce(jsonb_array_length(case when jsonb_typeof(r.claims) = 'array' then r.claims end), 0);
  n_drivers int := coalesce(jsonb_array_length(case when jsonb_typeof(r.drivers) = 'array' then r.drivers end), 0);
  has_usage boolean := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(r.vehicles) = 'array' then r.vehicles else '[]'::jsonb end) v where coalesce(v->>'usage','') <> '' or coalesce(v->>'annual_mileage','') <> '');
  txt text;
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

  -- What the page already tells us vs. what still has to be asked.
  if n_surch > 0 or n_claims > 0 then
    select string_agg(x, '; ') into txt from (
      select jsonb_array_elements_text(case when jsonb_typeof(r.surcharges) = 'array' then r.surcharges else '[]'::jsonb end) as x
      union all
      select jsonb_array_elements_text(case when jsonb_typeof(r.claims) = 'array' then r.claims else '[]'::jsonb end)
    ) t;
    reasons := reasons || jsonb_build_object('name', 'On the page', 'detail', left(txt, 400), 'decision', 'fact');
  end if;

  if r.policy_type in ('auto','commercial_auto') then
    if n_surch = 0 and n_claims = 0 then questions := questions || '"Tickets or accidents in the last 3 years"'::jsonb; end if;
    if not has_usage then questions := questions || '"Who drives each car, and how far"'::jsonb; end if;
    if n_drivers = 0 then questions := questions || '"Any teen or new drivers"'::jsonb; end if;
  elsif r.policy_type = 'home' then
    questions := '["Roof age and when it was last replaced","Year built and construction type"]'::jsonb;
    if n_claims = 0 then questions := questions || '"Any claims in the last 5 years"'::jsonb; end if;
    questions := questions || '"Pool, trampoline or dogs"'::jsonb;
  elsif r.policy_type = 'condo' then
    questions := '["Year built"]'::jsonb;
    if n_claims = 0 then questions := questions || '"Any claims in the last 5 years"'::jsonb; end if;
  elsif r.policy_type = 'renters' then
    if n_claims = 0 then questions := questions || '"Any claims in the last 5 years"'::jsonb; end if;
  elsif r.policy_type = 'umbrella' then
    questions := '["Underlying auto and home limits"]'::jsonb;
  elsif r.policy_type = 'commercial' then
    questions := '["What the business does, and annual revenue","Number of employees","Building owned or leased, and square footage"]'::jsonb;
    if n_claims = 0 then questions := questions || '"Any claims in the last 5 years"'::jsonb; end if;
  end if;
  if r.policy_type = 'commercial_auto' then
    questions := questions || '"What the vehicles are used for, and radius"'::jsonb;
  end if;

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

update public.rate_checks set decided_at = null where status not in ('pending','declined');

NOTIFY pgrst, 'reload schema';
