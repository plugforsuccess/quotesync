-- ============================================================================
-- Defensive Driving — Phase 1 security hardening (Supabase linter follow-ups)
-- ----------------------------------------------------------------------------
-- 1. Pin search_path on the updated_at trigger function.
-- 2. Trigger functions must not be exposed as REST RPC endpoints.
-- 3. The anon (public) role only needs to read the active catalog; it does not
--    need the SECURITY DEFINER role helpers, so split the catalog policy and
--    revoke anon EXECUTE on the helpers (authenticated keeps them for RLS).
-- ============================================================================

-- 1. ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dd_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- 2. ---------------------------------------------------------------------------
-- Triggers execute the function as the table owner regardless of EXECUTE grant,
-- so revoking here does not break the triggers — it only removes the RPC surface.
REVOKE ALL ON FUNCTION dd_touch_updated_at()    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dd_certificate_to_queue() FROM PUBLIC, anon, authenticated;

-- 3. ---------------------------------------------------------------------------
DROP POLICY IF EXISTS dd_courses_select_public ON dd_courses;

CREATE POLICY dd_courses_select_anon ON dd_courses
  FOR SELECT TO anon
  USING (is_active);

CREATE POLICY dd_courses_select_auth ON dd_courses
  FOR SELECT TO authenticated
  USING (is_active OR dd_is_staff());

REVOKE EXECUTE ON FUNCTION dd_is_admin()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION dd_is_staff()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION dd_is_principal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION dd_owns_enrollment(uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION dd_has_active_enrollment(uuid) FROM PUBLIC, anon;

-- Re-grant to authenticated (RLS policies for signed-in users call these).
GRANT EXECUTE ON FUNCTION dd_is_admin()      TO authenticated;
GRANT EXECUTE ON FUNCTION dd_is_staff()      TO authenticated;
GRANT EXECUTE ON FUNCTION dd_is_principal()  TO authenticated;
GRANT EXECUTE ON FUNCTION dd_owns_enrollment(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION dd_has_active_enrollment(uuid) TO authenticated;
