-- ============================================================================
-- policy_autocomplete — name <-> policy typeahead for the service-task form
-- ============================================================================
-- The customer directory is household-level and carries no policy numbers, so
-- it can't autofill a policy from a name (or vice versa). This searches the
-- policy-bearing sources (work lists + rep-logged tasks) and returns distinct
-- (customer, policy, product, phone) rows matching either a partial NAME or a
-- policy-number PREFIX — so typing part of a name suggests the customer and
-- fills their policy number, and typing a policy fills the name.
-- SECURITY DEFINER with an active-membership guard so any rep can use it.
-- ============================================================================

create or replace function public.policy_autocomplete(p_agency_id uuid, p_query text)
returns table (customer_name text, policy_no text, product text, phone text)
language sql
security definer
set search_path = public
as $function$
  with guard as (
    select 1 from public.agency_memberships m
    where m.user_id = auth.uid() and m.agency_id = p_agency_id
      and m.status = 'active'::membership_status
  ),
  src as (
    select customer_name, policy_no, product, phone from public.pending_cases where agency_id = p_agency_id
    union all
    select customer_name, policy_no, product, phone from public.renewal_cases where agency_id = p_agency_id
    union all
    select customer_name, policy_no, product, phone from public.lapse_events
      where agency_id = p_agency_id and coalesce(backfill, false) = false
    union all
    select customer_name, policy_no, product, null from public.revenue_entries
      where agency_id = p_agency_id and charged_back_at is null
    union all
    select customer_name, policy_no, product, customer_phone from public.service_tasks where agency_id = p_agency_id
  )
  select s.customer_name, s.policy_no, max(s.product) as product, max(s.phone) as phone
  from src s
  where exists (select 1 from guard)
    and s.policy_no is not null and trim(s.policy_no) <> ''
    and s.customer_name is not null and trim(s.customer_name) <> ''
    and (
      s.customer_name ilike '%' || trim(p_query) || '%'
      or s.policy_no ilike trim(p_query) || '%'
    )
  group by s.customer_name, s.policy_no
  order by s.customer_name, s.policy_no
  limit 12;
$function$;

grant execute on function public.policy_autocomplete(uuid, text) to authenticated;
