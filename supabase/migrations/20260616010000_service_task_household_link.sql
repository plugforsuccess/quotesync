-- ============================================================================
-- service_tasks.household_id — link a service task to the customer household
-- ============================================================================
-- The Service Batch customer field was free text. Storing the household id at
-- log time lets a task link to the exact household (robust against duplicate
-- names). household_id_for_name resolves a customer name to a household via the
-- same normalized name key the household layer uses; useCreateServiceTask calls
-- it on insert. Existing tasks are backfilled where the name matches.
-- ============================================================================

ALTER TABLE public.service_tasks ADD COLUMN IF NOT EXISTS household_id uuid;

CREATE OR REPLACE FUNCTION public.household_id_for_name(p_agency_id uuid, p_name text)
RETURNS uuid LANGUAGE sql STABLE AS $$
  select hm.household_id
  from public.household_members hm
  where hm.agency_id = p_agency_id
    and hm.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(p_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  limit 1;
$$;

GRANT EXECUTE ON FUNCTION public.household_id_for_name(uuid, text) TO authenticated;

UPDATE public.service_tasks st
SET household_id = hm.household_id
FROM public.household_members hm
WHERE st.household_id IS NULL
  AND st.customer_name IS NOT NULL
  AND hm.agency_id = st.agency_id
  AND hm.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(st.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'));
