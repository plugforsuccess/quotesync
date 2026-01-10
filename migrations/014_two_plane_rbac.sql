-- Migration: 014_two_plane_rbac.sql
-- Purpose: Implement two-plane RBAC design separating platform and tenant concerns
--
-- This migration introduces:
-- 1. Platform roles (for internal staff)
-- 2. Enhanced agency roles (for external customers)
-- 3. Proper separation of concerns between planes
-- 4. Impersonation sessions for safe admin troubleshooting
-- 5. Audit logging for all admin actions

-- =============================================================================
-- PLATFORM ROLES ENUM
-- =============================================================================
-- Platform roles are for internal staff only

CREATE TYPE platform_role AS ENUM (
    'platform_master_admin',  -- Full control (rare)
    'platform_admin',         -- Manage agencies, routing rules, users; read-only leads by default
    'platform_support',       -- View limited lead metadata for troubleshooting
    'platform_editor',        -- Newsroom content only; no lead access
    'platform_auditor'        -- Read-only logs and compliance exports
);

COMMENT ON TYPE platform_role IS 'Platform-level roles for internal staff only';

-- =============================================================================
-- ADD VIEWER TO AGENCY ROLES
-- =============================================================================
-- Add agency_viewer for read-only access (for executives)

ALTER TYPE agency_role ADD VALUE IF NOT EXISTS 'viewer';

-- =============================================================================
-- MEMBERSHIP STATUS ENUM
-- =============================================================================

CREATE TYPE membership_status AS ENUM ('active', 'suspended', 'pending_invite');

-- =============================================================================
-- UPDATE PROFILES TABLE
-- =============================================================================
-- Add platform role fields while preserving backward compatibility

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS platform_role platform_role,
    ADD COLUMN IF NOT EXISTS is_platform_user BOOLEAN NOT NULL DEFAULT false;

-- Create index for platform user lookups
CREATE INDEX IF NOT EXISTS idx_profiles_platform_role ON profiles(platform_role) WHERE platform_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_is_platform_user ON profiles(is_platform_user) WHERE is_platform_user = true;

COMMENT ON COLUMN profiles.platform_role IS 'Platform role for internal staff (null for agency users)';
COMMENT ON COLUMN profiles.is_platform_user IS 'True if user is internal staff, false for agency users';

-- =============================================================================
-- CREATE AGENCY_MEMBERSHIPS TABLE (REPLACES AGENCY_USERS)
-- =============================================================================
-- This is a more robust structure that supports multi-agency later

CREATE TABLE IF NOT EXISTS agency_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    agency_role agency_role NOT NULL DEFAULT 'agent',
    status membership_status NOT NULL DEFAULT 'active',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, agency_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_memberships_user_id ON agency_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_memberships_agency_id ON agency_memberships(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_memberships_status ON agency_memberships(status);
CREATE INDEX IF NOT EXISTS idx_agency_memberships_role ON agency_memberships(agency_role);

-- Auto-update timestamp trigger
CREATE TRIGGER set_agency_memberships_updated_at
    BEFORE UPDATE ON agency_memberships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE agency_memberships IS 'User membership in agencies with roles and status';
COMMENT ON COLUMN agency_memberships.agency_role IS 'Agency-level role: owner, manager, agent, viewer';
COMMENT ON COLUMN agency_memberships.status IS 'Membership status: active, suspended, pending_invite';
COMMENT ON COLUMN agency_memberships.invited_by IS 'User who invited this member (for audit trail)';

-- =============================================================================
-- MIGRATE DATA FROM AGENCY_USERS TO AGENCY_MEMBERSHIPS
-- =============================================================================

INSERT INTO agency_memberships (user_id, agency_id, agency_role, status, created_at)
SELECT
    user_id,
    agency_id,
    role,
    'active'::membership_status,
    created_at
FROM agency_users
ON CONFLICT (user_id, agency_id) DO NOTHING;

-- =============================================================================
-- IMPERSONATION SESSIONS TABLE
-- =============================================================================
-- For safe admin impersonation with audit trail

CREATE TABLE IF NOT EXISTS impersonation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    target_agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    actions_disabled BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_impersonation_sessions_admin ON impersonation_sessions(admin_user_id);
CREATE INDEX idx_impersonation_sessions_active ON impersonation_sessions(is_active) WHERE is_active = true;
CREATE INDEX idx_impersonation_sessions_started ON impersonation_sessions(started_at DESC);

COMMENT ON TABLE impersonation_sessions IS 'Tracks admin impersonation sessions for audit and safety';
COMMENT ON COLUMN impersonation_sessions.actions_disabled IS 'If true, write actions are disabled during impersonation';
COMMENT ON COLUMN impersonation_sessions.reason IS 'Required reason for impersonation (for audit trail)';

-- =============================================================================
-- HELPER FUNCTIONS FOR ROLE CHECKING
-- =============================================================================

-- Check if current user is a platform user with specified minimum role
CREATE OR REPLACE FUNCTION is_platform_user_with_role(min_role platform_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
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

-- Check if current user is platform master admin
CREATE OR REPLACE FUNCTION is_platform_master_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_platform_user = true
        AND platform_role = 'platform_master_admin'
    );
$$;

-- Check if current user is platform admin or higher
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT is_platform_user_with_role('platform_admin');
$$;

-- Check if current user is platform support or higher
CREATE OR REPLACE FUNCTION is_platform_support()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT is_platform_user_with_role('platform_support');
$$;

-- Check if current user is platform editor
CREATE OR REPLACE FUNCTION is_platform_editor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND is_platform_user = true
        AND platform_role IN ('platform_editor', 'platform_admin', 'platform_master_admin')
    );
$$;

-- Get user's agency memberships (updated to use new table)
CREATE OR REPLACE FUNCTION get_user_agency_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT agency_id
    FROM agency_memberships
    WHERE user_id = auth.uid()
    AND status = 'active';
$$;

-- Check if user has specific agency role
CREATE OR REPLACE FUNCTION has_agency_role(target_agency_id UUID, required_role agency_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM agency_memberships
        WHERE user_id = auth.uid()
        AND agency_id = target_agency_id
        AND status = 'active'
        AND (
            CASE required_role
                WHEN 'viewer' THEN agency_role IN ('viewer', 'agent', 'manager', 'owner')
                WHEN 'agent' THEN agency_role IN ('agent', 'manager', 'owner')
                WHEN 'manager' THEN agency_role IN ('manager', 'owner')
                WHEN 'owner' THEN agency_role = 'owner'
                ELSE false
            END
        )
    );
$$;

-- Check if user is currently impersonating
CREATE OR REPLACE FUNCTION is_impersonating()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT EXISTS (
        SELECT 1 FROM impersonation_sessions
        WHERE admin_user_id = auth.uid()
        AND is_active = true
    );
$$;

-- Get current impersonation session
CREATE OR REPLACE FUNCTION get_impersonation_session()
RETURNS TABLE (
    session_id UUID,
    target_user_id UUID,
    target_agency_id UUID,
    actions_disabled BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        id,
        target_user_id,
        target_agency_id,
        actions_disabled
    FROM impersonation_sessions
    WHERE admin_user_id = auth.uid()
    AND is_active = true
    LIMIT 1;
$$;

-- =============================================================================
-- ENABLE RLS ON NEW TABLES
-- =============================================================================

ALTER TABLE agency_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES FOR AGENCY_MEMBERSHIPS
-- =============================================================================

-- Agency users can view members of their own agencies
CREATE POLICY "Agency users view own agency members"
    ON agency_memberships FOR SELECT TO authenticated
    USING (
        agency_id IN (SELECT get_user_agency_ids())
        OR is_platform_admin()
    );

-- Owners and managers can add members to their agencies
CREATE POLICY "Owners/managers can add members"
    ON agency_memberships FOR INSERT TO authenticated
    WITH CHECK (
        has_agency_role(agency_id, 'manager')
        OR is_platform_admin()
    );

-- Owners can update member roles (except their own owner status)
CREATE POLICY "Owners can update members"
    ON agency_memberships FOR UPDATE TO authenticated
    USING (
        (has_agency_role(agency_id, 'owner') AND user_id != auth.uid())
        OR is_platform_admin()
    )
    WITH CHECK (
        (has_agency_role(agency_id, 'owner') AND user_id != auth.uid())
        OR is_platform_admin()
    );

-- Owners and managers can remove non-owner members
CREATE POLICY "Owners/managers can remove members"
    ON agency_memberships FOR DELETE TO authenticated
    USING (
        (has_agency_role(agency_id, 'manager') AND agency_role != 'owner')
        OR is_platform_admin()
    );

-- =============================================================================
-- RLS POLICIES FOR IMPERSONATION_SESSIONS
-- =============================================================================

-- Only platform admins can view impersonation sessions
CREATE POLICY "Platform admins view impersonation sessions"
    ON impersonation_sessions FOR SELECT TO authenticated
    USING (
        admin_user_id = auth.uid()
        OR is_platform_admin()
    );

-- Only platform admins can create impersonation sessions
CREATE POLICY "Platform admins create impersonation sessions"
    ON impersonation_sessions FOR INSERT TO authenticated
    WITH CHECK (
        is_platform_admin()
        AND admin_user_id = auth.uid()
    );

-- Only the session owner or master admin can end sessions
CREATE POLICY "Admins can update own impersonation sessions"
    ON impersonation_sessions FOR UPDATE TO authenticated
    USING (
        admin_user_id = auth.uid()
        OR is_platform_master_admin()
    )
    WITH CHECK (
        admin_user_id = auth.uid()
        OR is_platform_master_admin()
    );

-- =============================================================================
-- UPDATED LEADS POLICIES (TWO-PLANE SEPARATION)
-- =============================================================================

-- Drop existing admin lead policies if any
DROP POLICY IF EXISTS "Admins can view all leads" ON leads;
DROP POLICY IF EXISTS "Admins can update all leads" ON leads;

-- Platform support can view leads (read-only, for troubleshooting)
CREATE POLICY "Platform support view leads"
    ON leads FOR SELECT TO authenticated
    USING (
        agency_id IN (SELECT get_user_agency_ids())
        OR is_platform_support()
    );

-- Platform master admin can update leads (for reassignment)
CREATE POLICY "Platform master admin update leads"
    ON leads FOR UPDATE TO authenticated
    USING (is_platform_master_admin())
    WITH CHECK (is_platform_master_admin());

-- =============================================================================
-- PLATFORM EDITOR RESTRICTIONS (NO LEAD ACCESS)
-- =============================================================================
-- Platform editors should only access newsroom content
-- This is enforced by NOT granting them any lead policies

-- Stories policies for platform editors
DROP POLICY IF EXISTS "Authenticated users can view all stories" ON stories;

-- Platform editors and above can view all stories
CREATE POLICY "Platform editors view all stories"
    ON stories FOR SELECT TO authenticated
    USING (
        status = 'published'
        OR is_platform_editor()
        OR author_id = auth.uid()
    );

-- =============================================================================
-- AUDIT LOG ENHANCEMENTS
-- =============================================================================

-- Add actor_user_id to audit_log if not exists
ALTER TABLE audit_log
    ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ip_address INET,
    ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id);

-- Platform auditors can view all audit logs
DROP POLICY IF EXISTS "Admins can view all audit_log" ON audit_log;

CREATE POLICY "Platform auditors view all audit_log"
    ON audit_log FOR SELECT TO authenticated
    USING (
        agency_id IN (SELECT get_user_agency_ids())
        OR is_platform_user_with_role('platform_auditor')
    );

-- Platform admins can create audit entries
DROP POLICY IF EXISTS "Admins can create audit_log entries" ON audit_log;

CREATE POLICY "Platform users create audit entries"
    ON audit_log FOR INSERT TO authenticated
    WITH CHECK (
        agency_id IN (SELECT get_user_agency_ids())
        OR is_platform_support()
    );

-- =============================================================================
-- FUNCTION TO LOG ADMIN ACTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION log_admin_action(
    p_event_type TEXT,
    p_agency_id UUID DEFAULT NULL,
    p_lead_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO audit_log (
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

-- =============================================================================
-- FUNCTION TO START IMPERSONATION SESSION
-- =============================================================================

CREATE OR REPLACE FUNCTION start_impersonation(
    p_target_user_id UUID,
    p_reason TEXT,
    p_actions_enabled BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session_id UUID;
    v_target_agency_id UUID;
BEGIN
    -- Verify caller is platform admin
    IF NOT is_platform_admin() THEN
        RAISE EXCEPTION 'Only platform admins can impersonate users';
    END IF;

    -- End any existing active sessions for this admin
    UPDATE impersonation_sessions
    SET is_active = false, ended_at = now()
    WHERE admin_user_id = auth.uid() AND is_active = true;

    -- Get target user's primary agency
    SELECT agency_id INTO v_target_agency_id
    FROM agency_memberships
    WHERE user_id = p_target_user_id AND status = 'active'
    LIMIT 1;

    IF v_target_agency_id IS NULL THEN
        RAISE EXCEPTION 'Target user has no active agency membership';
    END IF;

    -- Create new impersonation session
    INSERT INTO impersonation_sessions (
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
    PERFORM log_admin_action(
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

-- =============================================================================
-- FUNCTION TO END IMPERSONATION SESSION
-- =============================================================================

CREATE OR REPLACE FUNCTION end_impersonation(p_session_id UUID DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_session RECORD;
BEGIN
    -- Get the session to end
    IF p_session_id IS NOT NULL THEN
        SELECT * INTO v_session
        FROM impersonation_sessions
        WHERE id = p_session_id
        AND (admin_user_id = auth.uid() OR is_platform_master_admin())
        AND is_active = true;
    ELSE
        SELECT * INTO v_session
        FROM impersonation_sessions
        WHERE admin_user_id = auth.uid()
        AND is_active = true
        LIMIT 1;
    END IF;

    IF v_session.id IS NULL THEN
        RETURN false;
    END IF;

    -- End the session
    UPDATE impersonation_sessions
    SET is_active = false, ended_at = now()
    WHERE id = v_session.id;

    -- Log the end of impersonation
    PERFORM log_admin_action(
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

-- =============================================================================
-- MIGRATE EXISTING ADMIN USERS TO PLATFORM ROLES
-- =============================================================================
-- Existing admins become platform_admin, editors become platform_editor

UPDATE profiles
SET
    is_platform_user = true,
    platform_role = CASE
        WHEN role = 'admin' THEN 'platform_admin'::platform_role
        WHEN role = 'editor' THEN 'platform_editor'::platform_role
        ELSE NULL
    END
WHERE role IN ('admin', 'editor');

-- =============================================================================
-- VIEWS FOR EASIER ACCESS
-- =============================================================================

-- View combining profile with agency memberships
CREATE OR REPLACE VIEW user_access_summary AS
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
FROM profiles p
LEFT JOIN agency_memberships am ON p.id = am.user_id
LEFT JOIN agencies a ON am.agency_id = a.id
GROUP BY p.id, p.email, p.full_name, p.is_platform_user, p.platform_role;

-- View for platform admins to see all impersonation history
CREATE OR REPLACE VIEW impersonation_history AS
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
FROM impersonation_sessions i
JOIN profiles admin_p ON i.admin_user_id = admin_p.id
JOIN profiles target_p ON i.target_user_id = target_p.id
JOIN agencies a ON i.target_agency_id = a.id;

-- Grant access to views
GRANT SELECT ON user_access_summary TO authenticated;
GRANT SELECT ON impersonation_history TO authenticated;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION is_platform_user_with_role(platform_role) IS 'Check if current user has at least the specified platform role';
COMMENT ON FUNCTION is_platform_master_admin() IS 'Check if current user is platform master admin';
COMMENT ON FUNCTION is_platform_admin() IS 'Check if current user is platform admin or higher';
COMMENT ON FUNCTION is_platform_support() IS 'Check if current user is platform support or higher';
COMMENT ON FUNCTION is_platform_editor() IS 'Check if current user is platform editor or higher';
COMMENT ON FUNCTION has_agency_role(UUID, agency_role) IS 'Check if current user has at least the specified role in an agency';
COMMENT ON FUNCTION is_impersonating() IS 'Check if current user is in an active impersonation session';
COMMENT ON FUNCTION start_impersonation(UUID, TEXT, BOOLEAN) IS 'Start an impersonation session (platform admin only)';
COMMENT ON FUNCTION end_impersonation(UUID) IS 'End an active impersonation session';
COMMENT ON FUNCTION log_admin_action(TEXT, UUID, UUID, JSONB) IS 'Log an admin action to the audit log';

COMMENT ON VIEW user_access_summary IS 'Summary of user access including platform and agency roles';
COMMENT ON VIEW impersonation_history IS 'History of impersonation sessions for audit';

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- Summary:
-- 1. Created platform_role enum with 5 levels
-- 2. Added 'viewer' to agency_role enum
-- 3. Added platform_role and is_platform_user to profiles
-- 4. Created agency_memberships table (improved agency_users)
-- 5. Created impersonation_sessions table
-- 6. Added helper functions for role checking
-- 7. Updated RLS policies for two-plane separation
-- 8. Created audit logging functions
-- 9. Migrated existing users to new structure
-- 10. Created views for access summary and impersonation history
-- =============================================================================
