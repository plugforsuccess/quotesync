-- ============================================================================
-- household_service_tasks — open admin/service work for a customer household
-- ============================================================================
-- The household view (Customer Search → household detail) showed policy records
-- and contact history, but not the customer's open service tasks (billing
-- change, ID cards, a coverage question…). This surfaces them so a rep sees the
-- open admin work the moment they pull the household up.
--
-- Matched to the household by the same normalized name key household_records
-- uses, so it's agency-scoped and consistent. SECURITY INVOKER (default) — RLS
-- on service_tasks still applies. Returns active tasks always, plus tasks
-- resolved in the last 90 days (so the UI can offer a "+N resolved" toggle).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.household_service_tasks(p_household uuid)
RETURNS TABLE(
  id uuid, task_type text, title text, detail text, status text, priority text,
  requires_license boolean, policy_no text, due_date date, created_at timestamptz,
  completed_at timestamptz, resolved boolean
)
LANGUAGE sql STABLE
AS $function$
  with member_keys as (
    select agency_id, name_key from public.household_members where household_id = p_household
  )
  select st.id, st.task_type, st.title, st.detail, st.status, st.priority,
         st.requires_license, st.policy_no, st.due_date, st.created_at, st.completed_at,
         (st.status in ('done','cancelled')) as resolved
  from public.service_tasks st
  join member_keys k
    on k.agency_id = st.agency_id
   and k.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(st.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  where st.status in ('open','in_progress','blocked')
     or (st.status in ('done','cancelled') and st.completed_at >= now() - interval '90 days')
  order by (st.status in ('open','in_progress','blocked')) desc, st.created_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.household_service_tasks(uuid) TO authenticated;
