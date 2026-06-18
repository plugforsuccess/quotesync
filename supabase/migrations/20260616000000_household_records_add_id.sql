-- ============================================================================
-- household_records: expose the underlying row id
-- ============================================================================
-- The household view now opens a renewal/cancel record in its case work-surface
-- modal in place. To fetch the right case, household_records returns the row id
-- (renewal_cases.id / pending_cases.id / revenue_entries.id / lapse_events.id).
-- Return type changed, so the function is dropped and recreated.
-- ============================================================================

DROP FUNCTION IF EXISTS public.household_records(uuid);

CREATE FUNCTION public.household_records(p_household uuid)
RETURNS TABLE(id uuid, source text, policy_no text, product text, status text, record_date date, premium numeric, detail text)
LANGUAGE sql STABLE
AS $function$
  with member_keys as (
    select agency_id, name_key from public.household_members where household_id = p_household
  ),
  recs as (
    select id, 'new_business'::text as source, policy_no, product,
           case when charged_back_at is not null then 'charged back' else 'issued' end as status,
           issued_date as record_date, premium, null::text as detail,
           agency_id, customer_name
    from public.revenue_entries
    union all
    select id, 'renewal', policy_no, product, status, renewal_date,
           premium, null, agency_id, customer_name
    from public.renewal_cases
    union all
    select id, 'cancel', policy_no, product, status, cancel_effective_date,
           premium_at_risk, coalesce(stage,''), agency_id, customer_name
    from public.pending_cases
    union all
    select id, 'termination', policy_no, product, 'lost', lapse_date,
           premium, termination_reason, agency_id, customer_name
    from public.lapse_events where backfill = false
  )
  select r.id, r.source, r.policy_no, r.product, r.status, r.record_date, r.premium, r.detail
  from recs r
  join member_keys k
    on k.agency_id = r.agency_id
   and k.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(r.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  order by r.record_date desc nulls last;
$function$;

GRANT EXECUTE ON FUNCTION public.household_records(uuid) TO authenticated;
