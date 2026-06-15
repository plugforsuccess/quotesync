-- ============================================================================
-- Unlicensed (front desk) RLS boundary — hard data-layer enforcement
-- ============================================================================
-- The unlicensed hat is confined in the UI, but RLS still let any active agency
-- member read the licensed retention tables via the API. This adds a hard
-- boundary: a clerical-only employee (roles contain 'unlicensed' and NO licensed
-- role) cannot touch renewal_cases / pending_cases, nor renewal/cancel case
-- notes. They keep full access to service_tasks and service-type notes.
--
-- Implemented as RESTRICTIVE policies so they AND with every existing permissive
-- policy without rewriting (and risking) the working grants. Principals/producers
-- (no employee row) and licensed reps are unaffected; service_role bypasses RLS.
-- ============================================================================

-- True only when the caller is an employee whose roles are clerical-only.
CREATE OR REPLACE FUNCTION public.is_clerical_only()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees e
    WHERE e.auth_user_id = auth.uid()
      AND e.roles @> ARRAY['unlicensed']::text[]
      AND NOT (e.roles && ARRAY['service_inbound','service_outbound','service','sales','admin']::text[])
  );
$$;

REVOKE ALL ON FUNCTION public.is_clerical_only() FROM public;
GRANT EXECUTE ON FUNCTION public.is_clerical_only() TO authenticated;

-- Licensed retention tables: clerical-only users get nothing.
DROP POLICY IF EXISTS block_clerical_renewal_cases ON public.renewal_cases;
CREATE POLICY block_clerical_renewal_cases ON public.renewal_cases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_clerical_only())
  WITH CHECK (NOT public.is_clerical_only());

DROP POLICY IF EXISTS block_clerical_pending_cases ON public.pending_cases;
CREATE POLICY block_clerical_pending_cases ON public.pending_cases
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_clerical_only())
  WITH CHECK (NOT public.is_clerical_only());

-- Case notes carry coverage/billing detail. Clerical may use service-task notes
-- but not renewal/cancel notes.
DROP POLICY IF EXISTS block_clerical_case_notes ON public.case_notes;
CREATE POLICY block_clerical_case_notes ON public.case_notes
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT public.is_clerical_only() OR case_type = 'service')
  WITH CHECK (NOT public.is_clerical_only() OR case_type = 'service');
