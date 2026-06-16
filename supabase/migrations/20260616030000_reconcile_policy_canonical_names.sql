-- ============================================================================
-- reconcile_households: policy-number identity + official-name canonicalization
-- ============================================================================
-- Households are name-keyed, so a service task typed as "Willie Randolph" and a
-- later official report for the same person but a different spelling would NOT
-- merge. This adds POLICY NUMBER as the stronger identity:
--   0. For any service task whose policy number matches a work-list record
--      (renewal/cancel/new-business/lapse), adopt that record's OFFICIAL customer
--      name — so the task consolidates under the authoritative name.
--   1. Build households from the (now-canonical) customer directory.
--   2. Re-link every service task to its household by the canonical name.
--
-- Called on "Rebuild directory" and now automatically after each report upload
-- (RetentionImport), so later uploads merge/canonicalize without a manual step.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reconcile_households(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
declare r record; new_hh uuid;
begin
  -- 0. Canonicalize service-task names to the official report name, by policy no.
  update public.service_tasks st
  set customer_name = official.name, updated_at = now()
  from (
    select agency_id, policy_no, name from (
      select agency_id, policy_no, customer_name as name,
             row_number() over (partition by agency_id, policy_no order by as_of desc nulls last) as rn
      from (
        select agency_id, policy_no, customer_name, issued_date as as_of from public.revenue_entries where charged_back_at is null
        union all select agency_id, policy_no, customer_name, renewal_date from public.renewal_cases
        union all select agency_id, policy_no, customer_name, cancel_effective_date from public.pending_cases
        union all select agency_id, policy_no, customer_name, lapse_date from public.lapse_events where backfill = false
      ) s
      where policy_no is not null and trim(policy_no) <> '' and customer_name is not null and trim(customer_name) <> ''
    ) ranked where rn = 1
  ) official
  where st.agency_id = p_agency_id
    and st.agency_id = official.agency_id
    and st.policy_no = official.policy_no
    and coalesce(st.customer_name,'') is distinct from official.name;

  -- 1. Build households from the customer directory (name-keyed).
  for r in
    select agency_id, name_key, display_name, zip, phone, email
    from public.customer_directory where agency_id = p_agency_id
  loop
    update public.household_members
      set display_name = r.display_name,
          zip   = coalesce(r.zip, zip),
          phone = coalesce(r.phone, phone),
          email = coalesce(r.email, email),
          updated_at = now()
      where agency_id = r.agency_id and name_key = r.name_key;
    if not found then
      insert into public.households (agency_id, display_name)
        values (r.agency_id, r.display_name) returning id into new_hh;
      insert into public.household_members
        (agency_id, household_id, name_key, display_name, zip, phone, email)
        values (r.agency_id, new_hh, r.name_key, r.display_name, r.zip, r.phone, r.email);
    end if;
  end loop;

  -- 2. (Re)link service tasks to their household by the now-canonical name.
  update public.service_tasks st
  set household_id = hm.household_id
  from public.household_members hm
  where st.agency_id = p_agency_id
    and st.customer_name is not null
    and hm.agency_id = st.agency_id
    and hm.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(st.customer_name,'')), '[^a-z ]','','g'), '\s+',' ','g'))
    and coalesce(st.household_id::text,'') is distinct from hm.household_id::text;
end;
$function$;
