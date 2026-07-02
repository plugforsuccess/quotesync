-- Touch history said "reached" and nothing else — the principal couldn't tell
-- whether the customer called in or the rep called out (direction has been
-- captured on renewal/cancel attempts since 20260630 but never returned), nor
-- what happened on the call (the tactic tags in `interventions` are required on
-- reached calls but weren't surfaced either, so a tagged call with no free-text
-- note rendered as an empty "reached"). Return both. Signature changes, so
-- drop + recreate.

DROP FUNCTION IF EXISTS public.household_touches(uuid);

CREATE FUNCTION public.household_touches(p_household uuid)
RETURNS TABLE(
  touched_at timestamptz, source text, method text, result text, note text,
  employee_name text, product text, policy_no text,
  direction text, interventions text[]
)
LANGUAGE sql STABLE AS $function$
  with member_keys as (
    select agency_id, name_key from public.household_members where household_id = p_household
  ),
  touches as (
    select a.attempted_at, 'cancel'::text as source, a.method, a.result, a.note,
           a.employee_id, pc.agency_id, pc.customer_name, pc.product, pc.policy_no,
           a.direction, a.interventions
    from public.pending_cancel_attempts a
    join public.pending_cases pc on pc.id = a.pending_case_id
    union all
    select a.attempted_at, 'renewal', a.method, a.result, a.note,
           a.employee_id, rc.agency_id, rc.customer_name, rc.product, rc.policy_no,
           a.direction, a.interventions
    from public.renewal_attempts a
    join public.renewal_cases rc on rc.id = a.renewal_case_id
    union all
    select a.attempted_at, 'cross_sell', a.method, a.result, a.note,
           a.employee_id, cs.agency_id, cs.customer_name, null::text, null::text,
           null::text, null::text[]
    from public.cross_sell_attempts a
    join public.cross_sell_cases cs on cs.id = a.cross_sell_case_id
    union all
    select a.attempted_at, 'lead', a.method, a.result, a.note,
           a.employee_id, l.agency_id,
           coalesce(l.first_name, '') || ' ' || coalesce(l.last_name, ''), null::text, null::text,
           null::text, null::text[]
    from public.lead_attempts a
    join public.leads l on l.id = a.lead_id
    union all
    select a.attempted_at, 'service', a.method, a.result, a.note,
           a.employee_id, st.agency_id, st.customer_name, null::text, null::text,
           null::text, null::text[]
    from public.service_task_attempts a
    join public.service_tasks st on st.id = a.service_task_id
  )
  select t.attempted_at, t.source, t.method, t.result, t.note,
         coalesce(e.preferred_name, trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,''))),
         t.product, t.policy_no, t.direction, t.interventions
  from touches t
  join member_keys k
    on k.agency_id = t.agency_id
   and k.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(t.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  left join public.employees e on e.id = t.employee_id
  order by t.attempted_at desc nulls last
  limit 100;
$function$;

GRANT EXECUTE ON FUNCTION public.household_touches(uuid) TO authenticated;

-- This project's PostgREST auto-reload is unreliable; without this the API keeps
-- a stale schema cache and rejects calls referencing the new return columns.
NOTIFY pgrst, 'reload schema';
