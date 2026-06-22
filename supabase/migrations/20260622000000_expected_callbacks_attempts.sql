-- ============================================================================
-- Expected-callbacks strip: surface last activity + attempt count
-- ============================================================================
-- The front-desk "If one of these customers calls in" strip is fed by
-- fd_expected_callbacks(), which returned only routing fields plus `since`
-- (last_attempt_at). Add `attempt_count` to the projection so the strip can show
-- how long we've been waiting to hear back AND how many times we've already
-- tried — so a stale, over-contacted callback is visible instead of silently
-- aging.
--
-- Built dynamically: renewal_cases is known to carry a denormalized
-- attempt_count, but we resolve each cases table's column at migration time and
-- fall back to 0 if it's absent, so this can't fail on a schema that lacks it.
-- The return signature changes, so the function is dropped and recreated (a bare
-- CREATE OR REPLACE can't change RETURNS), and the PostgREST schema cache is
-- reloaded so the new column is exposed immediately.
-- ============================================================================

DROP FUNCTION IF EXISTS public.fd_expected_callbacks();

DO $do$
DECLARE
  rc_attempts text := CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'renewal_cases' AND column_name = 'attempt_count'
  ) THEN 'r.attempt_count' ELSE '0' END;
  pc_attempts text := CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pending_cases' AND column_name = 'attempt_count'
  ) THEN 'p.attempt_count' ELSE '0' END;
BEGIN
  EXECUTE format($fmt$
    CREATE FUNCTION public.fd_expected_callbacks()
    RETURNS TABLE (
      case_type text, case_id uuid, customer_name text, customer_phone text,
      rep_name text, reason text, since timestamptz, attempt_count integer
    )
    LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $body$
      SELECT 'renewal'::text, r.id, r.customer_name, COALESCE(r.customer_phone, r.phone),
             NULLIF(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
             'Renewal'::text, r.last_attempt_at, COALESCE(%s, 0)::integer
      FROM renewal_cases r
      LEFT JOIN employees e ON e.id = r.assigned_to_id
      WHERE r.awaiting_callback = true
        AND r.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
        AND r.agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active')
      UNION ALL
      SELECT 'cancel'::text, p.id, p.customer_name, p.phone,
             NULLIF(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
             'Billing / Cancellation'::text, p.last_attempt_at, COALESCE(%s, 0)::integer
      FROM pending_cases p
      LEFT JOIN employees e ON e.id = p.assigned_to_id
      WHERE p.awaiting_callback = true
        AND p.status NOT IN ('saved','rewritten','lost','auto_resolved','cancelled','requested_cancellation')
        AND p.agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active');
    $body$
  $fmt$, rc_attempts, pc_attempts);
END $do$;

REVOKE ALL ON FUNCTION public.fd_expected_callbacks() FROM public;
GRANT EXECUTE ON FUNCTION public.fd_expected_callbacks() TO authenticated;

NOTIFY pgrst, 'reload schema';
