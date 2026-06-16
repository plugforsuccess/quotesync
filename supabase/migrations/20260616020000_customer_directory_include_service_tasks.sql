-- ============================================================================
-- customer_directory: include service-task customers (interim book coverage)
-- ============================================================================
-- The customer directory (search + household linking) was built only from the
-- work-list tables (renewal/cancel/new-business/lapse), which require a policy
-- number. A real customer who isn't currently on any of those lists (e.g. a
-- steady policy not up for renewal) was invisible — and a service task logged
-- against them couldn't link to a household.
--
-- Interim fix: add service_tasks as a directory source so any customer a rep
-- logs a task for becomes a real directory entry (searchable + gets a household
-- via reconcile_households, with 0 policies until the full book is imported).
--
-- Behavior preserved: policy-bearing customers are unchanged; only task-only
-- customers are added (active_policies = 0 for them).
--
-- NOTE: task-only customers materialize into household_members on the next
-- reconcile_households() (the "Rebuild directory" action / upload). Run it after
-- logging tasks for off-list customers to make them searchable + linkable.
--
-- The durable fix is a full in-force book/PIF roster importer (see
-- BOOK_IMPORT_SCOPE.md), which this interim mirrors.
-- ============================================================================

CREATE OR REPLACE VIEW public.customer_directory AS
WITH facts AS (
  SELECT agency_id, customer_name, policy_no, product, 'active'::text AS status,
         NULL::text AS zip, NULL::text AS phone, NULL::text AS email, issued_date AS as_of
  FROM public.revenue_entries WHERE charged_back_at IS NULL
  UNION ALL
  SELECT agency_id, customer_name, policy_no, product,
         CASE WHEN status='confirmed' THEN 'active' WHEN status='lost' THEN 'lost' ELSE 'renewal_open' END,
         NULL, COALESCE(phone, customer_phone), email, renewal_date
  FROM public.renewal_cases
  UNION ALL
  SELECT agency_id, customer_name, policy_no, product,
         CASE WHEN status IN ('saved','rewritten') THEN 'active' WHEN status='lost' THEN 'lost'
              WHEN stage='cancelled' THEN 'cancel_lapsed' ELSE 'cancel_pending' END,
         NULL, phone, NULL, cancel_effective_date
  FROM public.pending_cases
  UNION ALL
  SELECT agency_id, customer_name, policy_no, product, 'lost',
         zip, phone, email, lapse_date
  FROM public.lapse_events WHERE backfill = false
  UNION ALL
  -- INTERIM: customers known only via a logged service task become searchable.
  SELECT agency_id, customer_name, policy_no, NULL::text, 'task'::text,
         NULL::text, customer_phone, NULL::text, created_at::date
  FROM public.service_tasks
),
keyed AS (
  SELECT agency_id, customer_name, policy_no, product, status, zip, phone, email, as_of,
         trim(regexp_replace(regexp_replace(lower(coalesce(customer_name,'')), '[^a-z ]','','g'), '\s+',' ','g')) AS name_key
  FROM facts
  WHERE customer_name IS NOT NULL AND trim(customer_name) <> '' AND lower(trim(customer_name)) <> 'undefined'
),
per_policy AS (
  SELECT DISTINCT ON (agency_id, policy_no) agency_id, policy_no, name_key, customer_name, product, status, zip, phone, email, as_of
  FROM keyed
  WHERE policy_no IS NOT NULL AND trim(policy_no) <> ''
  ORDER BY agency_id, policy_no, as_of DESC NULLS LAST
),
poly AS (
  SELECT agency_id, name_key,
    count(*) FILTER (WHERE status IN ('active','renewal_open','cancel_pending')) AS active_policies,
    count(*) FILTER (WHERE status = 'lost') AS lost_policies,
    count(*) FILTER (WHERE status IN ('cancel_pending','cancel_lapsed')) AS cancel_open,
    count(*) FILTER (WHERE status = 'renewal_open') AS renewal_open,
    array_remove(array_agg(DISTINCT product) FILTER (WHERE status IN ('active','renewal_open','cancel_pending')), NULL) AS active_products,
    array_remove(array_agg(DISTINCT product) FILTER (WHERE status = 'lost'), NULL) AS lost_products
  FROM per_policy GROUP BY agency_id, name_key
),
names AS (
  SELECT agency_id, name_key, max(customer_name) AS display_name,
         max(zip) AS zip, max(phone) AS phone, max(email) AS email, max(as_of) AS last_activity
  FROM keyed
  WHERE (policy_no IS NOT NULL AND trim(policy_no) <> '') OR status = 'task'
  GROUP BY agency_id, name_key
)
SELECT n.agency_id, n.name_key, n.display_name, n.zip, n.phone, n.email,
  COALESCE(p.active_policies, 0) AS active_policies,
  COALESCE(p.lost_policies, 0) AS lost_policies,
  COALESCE(p.cancel_open, 0) AS cancel_open,
  COALESCE(p.renewal_open, 0) AS renewal_open,
  COALESCE(p.active_products, ARRAY[]::text[]) AS active_products,
  COALESCE(p.lost_products, ARRAY[]::text[]) AS lost_products,
  n.last_activity
FROM names n
LEFT JOIN poly p ON p.agency_id = n.agency_id AND p.name_key = n.name_key;
