-- ============================================================================
-- customer_search — search households by name, phone, OR policy number
-- ============================================================================
-- The customer lookup previously matched only household_directory.display_name.
-- Reps need to find a caller by phone or policy number too. This searches:
--   • name   — display_name ILIKE
--   • phone  — digits-only match (only when the query has no letters, so a
--              policy like "TEST-REN-002" doesn't false-match phones on "002")
--   • policy — households whose customer has a policy_no ILIKE the query, matched
--              by the same normalized name key the household layer uses.
-- Returns household_directory rows so the UI is unchanged. SECURITY INVOKER —
-- RLS on the underlying tables still applies.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.customer_search(p_agency_id uuid, p_query text)
RETURNS SETOF public.household_directory
LANGUAGE sql STABLE
AS $function$
  with q as (
    select trim(coalesce(p_query,'')) as raw,
           regexp_replace(coalesce(p_query,''), '\D', '', 'g') as digits,
           (coalesce(p_query,'') !~ '[A-Za-z]') as is_numeric_query
  ),
  policy_hh as (
    select distinct hm.household_id
    from public.household_members hm
    join (
      select agency_id, customer_name from public.renewal_cases where policy_no ilike '%'||(select raw from q)||'%'
      union all
      select agency_id, customer_name from public.pending_cases  where policy_no ilike '%'||(select raw from q)||'%'
      union all
      select agency_id, customer_name from public.revenue_entries where policy_no ilike '%'||(select raw from q)||'%'
    ) recs
      on recs.agency_id = hm.agency_id
     and hm.name_key = trim(regexp_replace(regexp_replace(lower(coalesce(recs.customer_name,'')), '[^a-z ]', '', 'g'), '\s+', ' ', 'g'))
    where hm.agency_id = p_agency_id
      and length((select raw from q)) >= 2
  )
  select d.*
  from public.household_directory d, q
  where d.agency_id = p_agency_id
    and (
      d.display_name ilike '%'||q.raw||'%'
      or (q.is_numeric_query and length(q.digits) >= 4
          and regexp_replace(coalesce(d.phone,''), '\D', '', 'g') like '%'||q.digits||'%')
      or d.household_id in (select household_id from policy_hh)
    )
  order by d.display_name
  limit 50;
$function$;

GRANT EXECUTE ON FUNCTION public.customer_search(uuid, text) TO authenticated;
