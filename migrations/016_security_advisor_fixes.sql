-- Migration: 016_security_advisor_fixes.sql
-- Purpose: Fix all issues flagged by Supabase Security Advisor
--
-- Fixes:
--   E-01: Recreate impersonation_history view as SECURITY INVOKER
--   E-02: Recreate user_access_summary view as SECURITY INVOKER
--   W-01: Drop all overly permissive "Service role can..." RLS policies
--   W-02: Tighten story_analytics anonymous insert policy
--   W-03: Set search_path = '' on all 13 public functions (prevent schema hijacking)
--
-- Note: Leaked password protection (W-04) is a Supabase Dashboard toggle,
--       not a SQL migration. Enable it at: Authentication → Settings → Password Security.
--
-- Troubleshooting: All functions use auth.uid() which is schema-qualified
-- (auth is a schema, not a search_path entry), so it resolves correctly with
-- search_path = ''. If a function raises "function auth.uid() does not exist"
-- in your environment, change SET search_path = '' to SET search_path = 'auth'
-- on the affected function(s).

-- =============================================================================
-- E-01 & E-02: FIX SECURITY DEFINER VIEWS
-- =============================================================================
-- These views were created by a superuser and default to SECURITY DEFINER
-- behavior, meaning queries run with owner (superuser) privileges and bypass
-- RLS on underlying tables. Recreate with security_invoker = on so that
-- the querying user's permissions apply.

DROP VIEW IF EXISTS public.user_access_summary;
CREATE VIEW public.user_access_summary
WITH (security_invoker = on)
AS
SELECT
    p.id AS user_id,
    p.email,
    p.full_name,
    p.is_platform_user,
    p.platform_role,
    COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'agency_id', am.agency_id,
                'agency_name', a.name,
                'role', am.agency_role,
                'status', am.status
            )
        ) FILTER (WHERE am.id IS NOT NULL),
        '[]'::jsonb
    ) AS agency_memberships
FROM public.profiles p
LEFT JOIN public.agency_memberships am ON p.id = am.user_id
LEFT JOIN public.agencies a ON am.agency_id = a.id
GROUP BY p.id, p.email, p.full_name, p.is_platform_user, p.platform_role;

GRANT SELECT ON public.user_access_summary TO authenticated;

COMMENT ON VIEW public.user_access_summary IS 'Summary of user access including platform and agency roles';

DROP VIEW IF EXISTS public.impersonation_history;
CREATE VIEW public.impersonation_history
WITH (security_invoker = on)
AS
SELECT
    i.id,
    i.admin_user_id,
    admin_p.email AS admin_email,
    admin_p.full_name AS admin_name,
    i.target_user_id,
    target_p.email AS target_email,
    target_p.full_name AS target_name,
    i.target_agency_id,
    a.name AS agency_name,
    i.reason,
    i.started_at,
    i.ended_at,
    i.is_active,
    i.actions_disabled,
    CASE
        WHEN i.ended_at IS NOT NULL THEN
            EXTRACT(EPOCH FROM (i.ended_at - i.started_at))
        ELSE
            EXTRACT(EPOCH FROM (now() - i.started_at))
    END AS duration_seconds
FROM public.impersonation_sessions i
JOIN public.profiles admin_p ON i.admin_user_id = admin_p.id
JOIN public.profiles target_p ON i.target_user_id = target_p.id
JOIN public.agencies a ON i.target_agency_id = a.id;

GRANT SELECT ON public.impersonation_history TO authenticated;

COMMENT ON VIEW public.impersonation_history IS 'History of impersonation sessions for audit';


-- =============================================================================
-- W-01: DROP OVERLY PERMISSIVE "SERVICE ROLE CAN..." RLS POLICIES
-- =============================================================================
-- The service_role key bypasses RLS entirely, so these USING(true) /
-- WITH CHECK(true) policies were never needed for Edge Functions.
-- They expose a risk because the anon key does NOT bypass RLS, and these
-- policies grant unrestricted access to any role including anon.

-- High risk: leads table (anon could insert/update arbitrary leads)
DROP POLICY IF EXISTS "Service role can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Service role can update leads" ON public.leads;

-- Moderate risk: notifications (anon could inject fake notifications)
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- Lower risk but unnecessary: audit_log, enrichment_jobs, lead_quotes,
-- webhook_secrets, lead_messages
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Service role can manage enrichment_jobs" ON public.enrichment_jobs;
DROP POLICY IF EXISTS "Service role can upsert lead_quotes" ON public.lead_quotes;
DROP POLICY IF EXISTS "Service role can manage webhook_secrets" ON public.webhook_secrets;
DROP POLICY IF EXISTS "Service role can insert lead messages" ON public.lead_messages;
DROP POLICY IF EXISTS "Service role can update lead messages" ON public.lead_messages;


-- =============================================================================
-- W-02: TIGHTEN STORY_ANALYTICS ANONYMOUS INSERT POLICY
-- =============================================================================
-- The original policy allowed unrestricted anonymous inserts with no validation.
-- Replace with a policy that requires non-null story_id and event_type, and
-- bounds the event_type length to prevent abuse.

DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.story_analytics;
CREATE POLICY "Anyone can insert analytics"
    ON public.story_analytics FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        story_id IS NOT NULL
        AND event_type IS NOT NULL
        AND char_length(event_type) < 50
    );


-- =============================================================================
-- W-03: SET search_path ON ALL PUBLIC FUNCTIONS
-- =============================================================================
-- Functions used in RLS policies are a privilege escalation vector if an
-- attacker can shadow objects in the search path. Setting search_path = ''
-- forces all references to be schema-qualified, preventing hijacking.
--
-- Since setting search_path = '' requires fully qualified table names,
-- we must recreate function bodies with public.* prefixes.

-- ---------------------------------------------------------------------------
-- 1. is_platform_user_with_role(platform_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_user_with_role(min_role platform_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND is_platform_user = true
        AND platform_role IS NOT NULL
        AND (
            CASE min_role
                WHEN 'platform_auditor' THEN platform_role IN ('platform_auditor', 'platform_editor', 'platform_support', 'platform_admin', 'platform_master_admin')
                WHEN 'platform_editor' THEN platform_role IN ('platform_editor', 'platform_admin', 'platform_master_admin')
                WHEN 'platform_support' THEN platform_role IN ('platform_support', 'platform_admin', 'platform_master_admin')
                WHEN 'platform_admin' THEN platform_role IN ('platform_admin', 'platform_master_admin')
                WHEN 'platform_master_admin' THEN platform_role = 'platform_master_admin'
                ELSE false
            END
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 2. is_platform_master_admin()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_master_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND is_platform_user = true
        AND platform_role = 'platform_master_admin'
    );
$$;

-- ---------------------------------------------------------------------------
-- 3. is_platform_admin()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_platform_user_with_role('platform_admin');
$$;

-- ---------------------------------------------------------------------------
-- 4. is_platform_support()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_support()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.is_platform_user_with_role('platform_support');
$$;

-- ---------------------------------------------------------------------------
-- 5. is_platform_editor()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_editor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND is_platform_user = true
        AND platform_role IN ('platform_editor', 'platform_admin', 'platform_master_admin')
    );
$$;

-- ---------------------------------------------------------------------------
-- 6. get_user_agency_ids()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_agency_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    -- First try the new agency_memberships table
    SELECT agency_id
    FROM public.agency_memberships
    WHERE user_id = auth.uid()
    AND status = 'active'
    UNION
    -- Fall back to legacy agency_users table for any unmigrated data
    SELECT agency_id
    FROM public.agency_users
    WHERE user_id = auth.uid()
    AND NOT EXISTS (
        SELECT 1 FROM public.agency_memberships am
        WHERE am.user_id = auth.uid()
        AND am.agency_id = public.agency_users.agency_id
    );
$$;

-- ---------------------------------------------------------------------------
-- 7. has_agency_role(UUID, agency_role)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_agency_role(target_agency_id UUID, required_role agency_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.agency_memberships
        WHERE user_id = auth.uid()
        AND agency_id = target_agency_id
        AND status = 'active'
        AND (
            CASE required_role
                WHEN 'agent' THEN agency_role IN ('agent', 'manager', 'owner')
                WHEN 'manager' THEN agency_role IN ('manager', 'owner')
                WHEN 'owner' THEN agency_role = 'owner'
                ELSE false
            END
        )
    );
$$;

-- ---------------------------------------------------------------------------
-- 8. is_impersonating()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_impersonating()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.impersonation_sessions
        WHERE admin_user_id = auth.uid()
        AND is_active = true
    );
$$;

-- ---------------------------------------------------------------------------
-- 9. get_impersonation_session()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_impersonation_session()
RETURNS TABLE (
    session_id UUID,
    target_user_id UUID,
    target_agency_id UUID,
    actions_disabled BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        id,
        target_user_id,
        target_agency_id,
        actions_disabled
    FROM public.impersonation_sessions
    WHERE admin_user_id = auth.uid()
    AND is_active = true
    LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 10. log_admin_action(TEXT, UUID, UUID, JSONB)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_admin_action(
    p_event_type TEXT,
    p_agency_id UUID DEFAULT NULL,
    p_lead_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO public.audit_log (
        event_type,
        agency_id,
        lead_id,
        actor_user_id,
        metadata,
        created_at
    ) VALUES (
        p_event_type,
        p_agency_id,
        p_lead_id,
        auth.uid(),
        p_metadata,
        now()
    )
    RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 11. start_impersonation(UUID, TEXT, BOOLEAN)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_impersonation(
    p_target_user_id UUID,
    p_reason TEXT,
    p_actions_enabled BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session_id UUID;
    v_target_agency_id UUID;
BEGIN
    -- Verify caller is platform admin
    IF NOT public.is_platform_admin() THEN
        RAISE EXCEPTION 'Only platform admins can impersonate users';
    END IF;

    -- End any existing active sessions for this admin
    UPDATE public.impersonation_sessions
    SET is_active = false, ended_at = now()
    WHERE admin_user_id = auth.uid() AND is_active = true;

    -- Get target user's primary agency
    SELECT agency_id INTO v_target_agency_id
    FROM public.agency_memberships
    WHERE user_id = p_target_user_id AND status = 'active'
    LIMIT 1;

    IF v_target_agency_id IS NULL THEN
        RAISE EXCEPTION 'Target user has no active agency membership';
    END IF;

    -- Create new impersonation session
    INSERT INTO public.impersonation_sessions (
        admin_user_id,
        target_user_id,
        target_agency_id,
        reason,
        actions_disabled
    ) VALUES (
        auth.uid(),
        p_target_user_id,
        v_target_agency_id,
        p_reason,
        NOT p_actions_enabled  -- Invert for storage
    )
    RETURNING id INTO v_session_id;

    -- Log the impersonation
    PERFORM public.log_admin_action(
        'ADMIN_IMPERSONATE_USER',
        v_target_agency_id,
        NULL,
        jsonb_build_object(
            'target_user_id', p_target_user_id,
            'session_id', v_session_id,
            'reason', p_reason,
            'actions_enabled', p_actions_enabled
        )
    );

    RETURN v_session_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 12. end_impersonation(UUID)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.end_impersonation(p_session_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_session RECORD;
BEGIN
    -- Get the session to end
    IF p_session_id IS NOT NULL THEN
        SELECT * INTO v_session
        FROM public.impersonation_sessions
        WHERE id = p_session_id
        AND (admin_user_id = auth.uid() OR public.is_platform_master_admin())
        AND is_active = true;
    ELSE
        SELECT * INTO v_session
        FROM public.impersonation_sessions
        WHERE admin_user_id = auth.uid()
        AND is_active = true
        LIMIT 1;
    END IF;

    IF v_session.id IS NULL THEN
        RETURN false;
    END IF;

    -- End the session
    UPDATE public.impersonation_sessions
    SET is_active = false, ended_at = now()
    WHERE id = v_session.id;

    -- Log the end of impersonation
    PERFORM public.log_admin_action(
        'ADMIN_END_IMPERSONATION',
        v_session.target_agency_id,
        NULL,
        jsonb_build_object(
            'session_id', v_session.id,
            'target_user_id', v_session.target_user_id,
            'duration_seconds', EXTRACT(EPOCH FROM (now() - v_session.started_at))
        )
    );

    RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 13. check_agency_approved_for_routing()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_agency_approved_for_routing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    -- Allow admins to create rules, but they'll only be "active" for approved agencies
    -- This is a documentation constraint - actual routing logic should check agency status
    RETURN NEW;
END;
$$;


-- =============================================================================
-- VERIFICATION QUERIES (run after migration to confirm fixes)
-- =============================================================================
-- These are SELECT-only and safe to run in the migration.

-- Verify no public functions have unset search_path
-- (Expected: 0 rows after this migration)
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND (proconfig IS NULL OR NOT proconfig::text[] @> ARRAY['search_path='])
    AND proname IN (
        'is_platform_user_with_role', 'is_platform_master_admin', 'is_platform_admin',
        'is_platform_support', 'is_platform_editor', 'get_user_agency_ids',
        'has_agency_role', 'is_impersonating', 'get_impersonation_session',
        'log_admin_action', 'start_impersonation', 'end_impersonation',
        'check_agency_approved_for_routing'
    );

    IF v_count > 0 THEN
        RAISE WARNING '% functions still have mutable search_path', v_count;
    ELSE
        RAISE NOTICE 'All 13 functions have search_path set correctly';
    END IF;
END $$;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Summary:
--   1. Recreated user_access_summary and impersonation_history views with
--      security_invoker = on (fixes E-01, E-02)
--   2. Dropped 9 overly permissive "Service role can..." RLS policies
--      (fixes W-01 — anon key exposure)
--   3. Tightened story_analytics anonymous insert policy with field validation
--      (fixes W-02)
--   4. Set search_path = '' on all 13 public functions with fully qualified
--      table/function references (fixes W-03 — schema hijacking)
--
-- MANUAL STEP REQUIRED:
--   Enable leaked password protection in Supabase Dashboard:
--   Authentication → Settings → Password Security → "Leaked password protection"
-- =============================================================================
