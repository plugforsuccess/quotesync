-- household_records: include callback_at so a household/customer-search case row
-- can show the scheduled callback. Return type changes, so drop + recreate.
drop function if exists public.household_records(uuid);
create or replace function public.household_records(p_household uuid)
returns table(id uuid, source text, policy_no text, product text, status text, record_date date, premium numeric, detail text, callback_at timestamptz)
language sql stable
as $function$
  with member_keys as (
    select agency_id, name_key from public.household_members where household_id = p_household
  ),
  recs as (
    select id, 'new_business'::text as source, policy_no, product,
           case when charged_back_at is not null then 'charged back' else 'issued' end as status,
           issued_date as record_date, premium, null::text as detail, null::timestamptz as callback_at,
           agency_id, customer_name
    from public.revenue_entries
    union all
    select id, 'renewal', policy_no, product, status, renewal_date,
           premium, null, callback_at, agency_id, customer_name
    from public.renewal_cases
    union all
    select id, 'cancel', policy_no, product, status, cancel_effective_date,
           premium_at_risk, coalesce(stage,''), callback_at, agency_id, customer_name
    from public.pending_cases
    union all
    select id, 'termination', policy_no, product, 'lost', lapse_date,
           premium, termination_reason, null, agency_id, customer_name
    from public.lapse_events where backfill = false
  )
  select r.id, r.source, r.policy_no, r.product, r.status, r.record_date, r.premium, r.detail, r.callback_at
  from recs r
  join member_keys k
    on k.agency_id = r.agency_id
   and k.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(r.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  order by r.record_date desc nulls last;
$function$;
grant execute on function public.household_records(uuid) to authenticated;
