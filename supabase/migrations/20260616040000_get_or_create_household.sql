-- ============================================================================
-- get_or_create_household — resolve OR create a household at task-log time
-- ============================================================================
-- Only principals rebuild the directory, so a rep logging a service task for an
-- off-list customer would otherwise wait for the next principal upload/rebuild
-- before that customer is searchable. This resolves the customer to a household
-- by normalized name, creating one on the spot if they don't exist yet — so a
-- rep-logged customer is searchable and the task links immediately.
--
-- SECURITY DEFINER (with an active-agency-membership guard) so a rep can create
-- the household entry for their own agency without broad write grants. Later
-- report uploads canonicalize the name by policy number (reconcile_households).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_household(p_agency_id uuid, p_name text, p_phone text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare v_key text; v_hh uuid;
begin
  if not exists (
    select 1 from public.agency_memberships
    where user_id = auth.uid() and agency_id = p_agency_id and status = 'active'::membership_status
  ) then
    return null;
  end if;

  if p_name is null or trim(p_name) = '' then return null; end if;
  v_key := trim(regexp_replace(regexp_replace(lower(p_name), '[^a-z ]','','g'), '\s+',' ','g'));
  if v_key = '' then return null; end if;

  select household_id into v_hh
  from public.household_members
  where agency_id = p_agency_id and name_key = v_key
  limit 1;
  if v_hh is not null then return v_hh; end if;

  insert into public.households (agency_id, display_name) values (p_agency_id, p_name) returning id into v_hh;
  insert into public.household_members (agency_id, household_id, name_key, display_name, phone)
    values (p_agency_id, v_hh, v_key, p_name, p_phone);
  return v_hh;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.get_or_create_household(uuid, text, text) TO authenticated;
