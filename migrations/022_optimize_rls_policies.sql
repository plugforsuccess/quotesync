-- Migration: 022_optimize_rls_policies.sql
-- Purpose: Fix RLS InitPlan performance + consolidate multiple permissive policies
--
-- Two optimizations applied:
--   1. Wrap auth.<function>() calls in (select ...) so Postgres evaluates them
--      once per query instead of per row (InitPlan optimization)
--   2. Merge multiple permissive policies for the same table/role/action into
--      a single policy (Postgres OR's permissive policies and must evaluate all)
--
-- Reference: https://supabase.com/docs/guides/database/database-linter

BEGIN;

-- =============================================================================
-- TABLE: user_roles
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Allow authenticated users to read their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid()) AND role = 'admin'
    )
  );

-- =============================================================================
-- TABLE: stories
-- =============================================================================
-- SELECT: Consolidate 4 policies into 2 (anon + authenticated)
-- UPDATE: Consolidate 3 policies (including duplicate) into 1
-- INSERT: InitPlan fix only
-- DELETE: InitPlan fix only

-- Drop all existing SELECT policies
DROP POLICY IF EXISTS "Anyone can view published stories" ON public.stories;
DROP POLICY IF EXISTS "Authenticated users can view non-archived stories" ON public.stories;
DROP POLICY IF EXISTS "Admins can view archived stories" ON public.stories;
DROP POLICY IF EXISTS "Platform editors view all stories" ON public.stories;
DROP POLICY IF EXISTS "Authenticated users can view all stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can view all stories" ON public.stories;

-- Drop all existing UPDATE policies (includes duplicate pair)
DROP POLICY IF EXISTS "Editors can update their own drafts" ON public.stories;
DROP POLICY IF EXISTS "Editors can update own drafts" ON public.stories;
DROP POLICY IF EXISTS "Admins can update any story" ON public.stories;

-- Drop INSERT and DELETE policies
DROP POLICY IF EXISTS "Editors can create stories" ON public.stories;
DROP POLICY IF EXISTS "Admins can delete stories" ON public.stories;

-- SELECT: Anon users see only published stories
CREATE POLICY "Anon view published stories"
  ON public.stories FOR SELECT
  TO anon
  USING (status = 'published');

-- SELECT: Single consolidated policy for authenticated users
CREATE POLICY "Authenticated view stories"
  ON public.stories FOR SELECT
  TO authenticated
  USING (
    status = 'published'
    OR (select is_platform_editor())
    OR author_id = (select auth.uid())
    OR (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()))
      AND status != 'archived'
    )
    OR (
      status = 'archived'
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    )
  );

-- UPDATE: Single consolidated policy (merges editor + admin + drops duplicate)
CREATE POLICY "Authenticated update stories"
  ON public.stories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR (
      (select auth.uid()) = author_id
      AND status IN ('draft', 'in_review')
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'editor')
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR (
      (select auth.uid()) = author_id
      AND status IN ('draft', 'in_review')
    )
  );

-- INSERT: InitPlan fix
CREATE POLICY "Editors can create stories"
  ON public.stories FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = author_id
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()))
  );

-- DELETE: InitPlan fix
CREATE POLICY "Admins can delete stories"
  ON public.stories FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- =============================================================================
-- TABLE: story_drafts
-- =============================================================================
-- SELECT: Consolidate 2 → 1
-- DELETE: Consolidate 2 → 1
-- INSERT/UPDATE: InitPlan fix

DROP POLICY IF EXISTS "Users can view own drafts" ON public.story_drafts;
DROP POLICY IF EXISTS "Admins can view all drafts" ON public.story_drafts;
DROP POLICY IF EXISTS "Users can create own drafts" ON public.story_drafts;
DROP POLICY IF EXISTS "Users can update own drafts" ON public.story_drafts;
DROP POLICY IF EXISTS "Users can delete own drafts" ON public.story_drafts;
DROP POLICY IF EXISTS "Admins can delete any draft" ON public.story_drafts;

-- SELECT: Consolidated
CREATE POLICY "View story drafts"
  ON public.story_drafts FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- INSERT: InitPlan fix
CREATE POLICY "Users can create own drafts"
  ON public.story_drafts FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

-- UPDATE: InitPlan fix
CREATE POLICY "Users can update own drafts"
  ON public.story_drafts FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = author_id)
  WITH CHECK ((select auth.uid()) = author_id);

-- DELETE: Consolidated
CREATE POLICY "Delete story drafts"
  ON public.story_drafts FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) = author_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- =============================================================================
-- TABLE: story_analytics
-- =============================================================================
-- "Anyone can insert analytics" has no auth functions — no change needed

DROP POLICY IF EXISTS "Admins can view analytics" ON public.story_analytics;

CREATE POLICY "Admins can view analytics"
  ON public.story_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = (select auth.uid()) AND role = 'admin'
    )
  );

-- =============================================================================
-- TABLE: profiles
-- =============================================================================
-- SELECT: "Authenticated users can view all profiles" has no auth calls — no change
-- UPDATE: Consolidate 2 → 1

DROP POLICY IF EXISTS "Users can update own full_name" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;

CREATE POLICY "Update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR (
      (select auth.uid()) = id
      AND (
        (full_name IS DISTINCT FROM (SELECT full_name FROM public.profiles WHERE id = (select auth.uid())))
        OR (updated_at IS DISTINCT FROM (SELECT updated_at FROM public.profiles WHERE id = (select auth.uid())))
      )
    )
  );

-- =============================================================================
-- TABLE: agencies
-- =============================================================================
-- SELECT: Consolidate anon (2→1) and authenticated (3→1)
-- UPDATE: Consolidate 2→1
-- INSERT: No auth functions — no change

DROP POLICY IF EXISTS "Agency users can view their agency" ON public.agencies;
DROP POLICY IF EXISTS "Users can view own agencies" ON public.agencies;
DROP POLICY IF EXISTS "Admins can view all agencies" ON public.agencies;
DROP POLICY IF EXISTS "Anon can read default agency" ON public.agencies;
DROP POLICY IF EXISTS "Owners can update own agency" ON public.agencies;
DROP POLICY IF EXISTS "Admins can update any agency" ON public.agencies;

-- SELECT: Anon can only see default agency
CREATE POLICY "Anon view default agency"
  ON public.agencies FOR SELECT
  TO anon
  USING (is_default = true);

-- SELECT: Consolidated authenticated
CREATE POLICY "Authenticated view agencies"
  ON public.agencies FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR id IN (SELECT get_user_agency_ids())
    OR is_default = true
  );

-- UPDATE: Consolidated authenticated
CREATE POLICY "Authenticated update agencies"
  ON public.agencies FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  );

-- =============================================================================
-- TABLE: agency_users
-- =============================================================================
-- All 4 actions: Consolidate admin + agency policies

DROP POLICY IF EXISTS "Users can view agency members" ON public.agency_users;
DROP POLICY IF EXISTS "Users can view their agency memberships" ON public.agency_users;
DROP POLICY IF EXISTS "Admins can view all agency_users" ON public.agency_users;
DROP POLICY IF EXISTS "Owners and managers can add members" ON public.agency_users;
DROP POLICY IF EXISTS "Admins can create agency_users" ON public.agency_users;
DROP POLICY IF EXISTS "Owners can update member roles" ON public.agency_users;
DROP POLICY IF EXISTS "Admins can update agency_users" ON public.agency_users;
DROP POLICY IF EXISTS "Owners and managers can remove members" ON public.agency_users;
DROP POLICY IF EXISTS "Admins can delete agency_users" ON public.agency_users;

-- SELECT: Consolidated
CREATE POLICY "View agency_users"
  ON public.agency_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (SELECT get_user_agency_ids())
    OR user_id = (select auth.uid())
  );

-- INSERT: Consolidated
CREATE POLICY "Insert agency_users"
  ON public.agency_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role IN ('owner', 'manager')
    )
  );

-- UPDATE: Consolidated
CREATE POLICY "Update agency_users"
  ON public.agency_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  );

-- DELETE: Consolidated
CREATE POLICY "Delete agency_users"
  ON public.agency_users FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR (
      agency_id IN (
        SELECT agency_id FROM public.agency_users
        WHERE user_id = (select auth.uid()) AND role IN ('owner', 'manager')
      )
      AND role != 'owner'
    )
  );

-- =============================================================================
-- TABLE: leads
-- =============================================================================
-- SELECT: Consolidate 3 → 1
-- UPDATE: Consolidate 3 → 1
-- DELETE: InitPlan fix only
-- INSERT: "Users can create agency leads" uses get_user_agency_ids() — no change
-- INSERT: "Anon can insert partial leads only" — no change

DROP POLICY IF EXISTS "Agency users can view their leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view agency leads" ON public.leads;
DROP POLICY IF EXISTS "Platform support view leads" ON public.leads;
DROP POLICY IF EXISTS "Agency users can update their leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update agency leads" ON public.leads;
DROP POLICY IF EXISTS "Platform master admin update leads" ON public.leads;
DROP POLICY IF EXISTS "Owners and managers can delete leads" ON public.leads;

-- SELECT: Consolidated
CREATE POLICY "Authenticated view leads"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    (select is_platform_support())
    OR agency_id IN (SELECT get_user_agency_ids())
  );

-- UPDATE: Consolidated
CREATE POLICY "Authenticated update leads"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    (select is_platform_master_admin())
    OR agency_id IN (SELECT get_user_agency_ids())
  )
  WITH CHECK (
    (select is_platform_master_admin())
    OR agency_id IN (SELECT get_user_agency_ids())
  );

-- DELETE: InitPlan fix
CREATE POLICY "Owners and managers can delete leads"
  ON public.leads FOR DELETE
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role IN ('owner', 'manager')
    )
  );

-- =============================================================================
-- TABLE: lead_quotes
-- =============================================================================
-- Only DELETE policy uses direct auth.uid()

DROP POLICY IF EXISTS "Owners and managers can delete lead_quotes" ON public.lead_quotes;

CREATE POLICY "Owners and managers can delete lead_quotes"
  ON public.lead_quotes FOR DELETE
  TO authenticated
  USING (
    agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role IN ('owner', 'manager')
    )
  );

-- =============================================================================
-- TABLE: lead_messages
-- =============================================================================

DROP POLICY IF EXISTS "Agency users can view their lead messages" ON public.lead_messages;

CREATE POLICY "Agency users can view their lead messages"
  ON public.lead_messages FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id FROM public.leads l
      JOIN public.agency_users au ON au.agency_id = l.agency_id
      WHERE au.user_id = (select auth.uid())
    )
  );

-- =============================================================================
-- TABLE: routing_rules
-- =============================================================================
-- All 4 actions: Consolidate admin + owner policies

DROP POLICY IF EXISTS "Agency managers can view routing rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Users can view agency routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Admins can view all routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Owners can create routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Admins can create routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Owners can update routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Admins can update routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Owners can delete routing_rules" ON public.routing_rules;
DROP POLICY IF EXISTS "Admins can delete routing_rules" ON public.routing_rules;

-- SELECT: Consolidated
CREATE POLICY "View routing_rules"
  ON public.routing_rules FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (SELECT get_user_agency_ids())
  );

-- INSERT: Consolidated
CREATE POLICY "Create routing_rules"
  ON public.routing_rules FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  );

-- UPDATE: Consolidated
CREATE POLICY "Update routing_rules"
  ON public.routing_rules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  );

-- DELETE: Consolidated
CREATE POLICY "Delete routing_rules"
  ON public.routing_rules FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR agency_id IN (
      SELECT agency_id FROM public.agency_users
      WHERE user_id = (select auth.uid()) AND role = 'owner'
    )
  );

-- =============================================================================
-- TABLE: audit_log
-- =============================================================================
-- SELECT: Consolidate 3 → 1
-- INSERT: Consolidate 2 → 1

DROP POLICY IF EXISTS "Agency users can view their audit logs" ON public.audit_log;
DROP POLICY IF EXISTS "Users can view agency audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Platform auditors view all audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Users can create audit_log entries" ON public.audit_log;
DROP POLICY IF EXISTS "Platform users create audit entries" ON public.audit_log;

-- SELECT: Consolidated
CREATE POLICY "View audit_log"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    (select is_platform_user_with_role('platform_auditor'))
    OR agency_id IN (SELECT get_user_agency_ids())
  );

-- INSERT: Consolidated
CREATE POLICY "Create audit_log"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (
    (select is_platform_support())
    OR agency_id IN (SELECT get_user_agency_ids())
  );

-- =============================================================================
-- TABLE: notifications
-- =============================================================================

DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;

CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update their notifications"
  ON public.notifications FOR UPDATE
  USING (user_id = (select auth.uid()));

-- =============================================================================
-- TABLE: story_category_definitions
-- =============================================================================
-- Split FOR ALL into separate write policies to avoid extra permissive SELECT

DROP POLICY IF EXISTS "Admins can manage category definitions" ON public.story_category_definitions;
DROP POLICY IF EXISTS "Anyone can read category definitions" ON public.story_category_definitions;

CREATE POLICY "Anyone can read category definitions"
  ON public.story_category_definitions FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert category definitions"
  ON public.story_category_definitions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Admins can update category definitions"
  ON public.story_category_definitions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Admins can delete category definitions"
  ON public.story_category_definitions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- =============================================================================
-- TABLE: story_tag_definitions
-- =============================================================================
-- Same treatment as category_definitions

DROP POLICY IF EXISTS "Admins can manage tag definitions" ON public.story_tag_definitions;
DROP POLICY IF EXISTS "Anyone can read tag definitions" ON public.story_tag_definitions;

CREATE POLICY "Anyone can read tag definitions"
  ON public.story_tag_definitions FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert tag definitions"
  ON public.story_tag_definitions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Admins can update tag definitions"
  ON public.story_tag_definitions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

CREATE POLICY "Admins can delete tag definitions"
  ON public.story_tag_definitions FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND role = 'admin')
  );

-- =============================================================================
-- TABLE: agency_memberships
-- =============================================================================
-- Only UPDATE policy uses direct auth.uid()

DROP POLICY IF EXISTS "Owners can update members" ON public.agency_memberships;

CREATE POLICY "Owners can update members"
  ON public.agency_memberships FOR UPDATE
  TO authenticated
  USING (
    (has_agency_role(agency_id, 'owner') AND user_id != (select auth.uid()))
    OR (select is_platform_admin())
  )
  WITH CHECK (
    (has_agency_role(agency_id, 'owner') AND user_id != (select auth.uid()))
    OR (select is_platform_admin())
  );

-- =============================================================================
-- TABLE: impersonation_sessions
-- =============================================================================

DROP POLICY IF EXISTS "Platform admins view impersonation sessions" ON public.impersonation_sessions;
DROP POLICY IF EXISTS "Platform admins create impersonation sessions" ON public.impersonation_sessions;
DROP POLICY IF EXISTS "Admins can update own impersonation sessions" ON public.impersonation_sessions;

CREATE POLICY "Platform admins view impersonation sessions"
  ON public.impersonation_sessions FOR SELECT
  TO authenticated
  USING (
    admin_user_id = (select auth.uid())
    OR (select is_platform_admin())
  );

CREATE POLICY "Platform admins create impersonation sessions"
  ON public.impersonation_sessions FOR INSERT
  TO authenticated
  WITH CHECK (
    (select is_platform_admin())
    AND admin_user_id = (select auth.uid())
  );

CREATE POLICY "Admins can update own impersonation sessions"
  ON public.impersonation_sessions FOR UPDATE
  TO authenticated
  USING (
    admin_user_id = (select auth.uid())
    OR (select is_platform_master_admin())
  )
  WITH CHECK (
    admin_user_id = (select auth.uid())
    OR (select is_platform_master_admin())
  );

COMMIT;
