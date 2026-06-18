-- ============================================================================
-- service_tasks.product — capture the line of business (AUTO, HO, …) per task
-- ============================================================================
-- A service request lives against a customer, but until now nothing recorded
-- WHICH policy line it touched. On the household view that left "Active: none"
-- with no product context, and the Service Batch couldn't be sliced by line of
-- business. Add `product` (same vocabulary household_directory.active_products
-- uses) so every task names its line, and the time-to-complete curve can be read
-- per product.
--
-- Nullable: legacy tasks and quick clerical work (a document request) don't
-- always have a single line. CHECK keeps it to the known Allstate-shape lines.
-- ============================================================================

ALTER TABLE public.service_tasks
  ADD COLUMN IF NOT EXISTS product text
    CHECK (product IS NULL OR product IN (
      'auto','ho','renters','condo','landlord','pup','boat',
      'specialty_auto','life','manufactured','other'));

CREATE INDEX IF NOT EXISTS idx_service_tasks_product
  ON public.service_tasks (agency_id, product);

-- Surface product on the household view's open-service-work feed. The return
-- type gains a column, so the existing function must be dropped first (Postgres
-- won't change an OUT-parameter signature via CREATE OR REPLACE).
DROP FUNCTION IF EXISTS public.household_service_tasks(uuid);

CREATE FUNCTION public.household_service_tasks(p_household uuid)
RETURNS TABLE(
  id uuid, task_type text, title text, detail text, status text, priority text,
  requires_license boolean, policy_no text, product text, due_date date,
  created_at timestamptz, completed_at timestamptz, resolved boolean
)
LANGUAGE sql STABLE
AS $function$
  with member_keys as (
    select agency_id, name_key from public.household_members where household_id = p_household
  )
  select st.id, st.task_type, st.title, st.detail, st.status, st.priority,
         st.requires_license, st.policy_no, st.product, st.due_date, st.created_at,
         st.completed_at, (st.status in ('done','cancelled')) as resolved
  from public.service_tasks st
  join member_keys k
    on k.agency_id = st.agency_id
   and k.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(st.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
  where st.status in ('open','in_progress','blocked')
     or (st.status in ('done','cancelled') and st.completed_at >= now() - interval '90 days')
  order by (st.status in ('open','in_progress','blocked')) desc, st.created_at desc;
$function$;

GRANT EXECUTE ON FUNCTION public.household_service_tasks(uuid) TO authenticated;
