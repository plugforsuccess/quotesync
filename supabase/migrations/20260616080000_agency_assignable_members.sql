-- ============================================================================
-- agency_assignable_members — who can a task be assigned to
-- ============================================================================
-- The Service Batch assignee dropdown read the `employees` table, so an active
-- agency member (e.g. a sales producer or unlicensed front-desk member) who has
-- a membership but no employee row could not be assigned a task. service_tasks
-- .assigned_to_id has no FK, so we can safely assign to any agency member.
--
-- This returns one row per active agency member, keyed by their employee id when
-- one exists (so attribution/display keep working) and falling back to the user
-- id otherwise. SECURITY DEFINER with an active-membership guard so a rep can
-- read the roster for their own agency without broad grants on memberships/profiles.
-- ============================================================================

create or replace function public.agency_assignable_members(p_agency_id uuid)
returns table (id uuid, name text, role text, has_employee boolean)
language sql
security definer
set search_path = public
as $function$
  select * from (
    select distinct on (m.user_id)
      coalesce(e.id, m.user_id) as id,
      coalesce(
        nullif(trim(coalesce(e.preferred_name, e.first_name) || ' ' || coalesce(e.last_name, '')), ''),
        p.full_name,
        p.email,
        'Member'
      ) as name,
      m.agency_role::text as role,
      (e.id is not null) as has_employee
    from public.agency_memberships m
    left join public.employees e
      on e.auth_user_id = m.user_id and e.org_id = m.agency_id and e.employment_status = 'active'
    left join public.profiles p on p.id = m.user_id
    where m.agency_id = p_agency_id
      and m.status = 'active'::membership_status
      and exists (
        select 1 from public.agency_memberships me
        where me.user_id = auth.uid() and me.agency_id = p_agency_id
          and me.status = 'active'::membership_status
      )
    order by m.user_id, (e.id is not null) desc
  ) s
  order by s.name;
$function$;

grant execute on function public.agency_assignable_members(uuid) to authenticated;
