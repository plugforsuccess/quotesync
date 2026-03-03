-- Migration: 030_rbac_self_read_policies.sql
-- Purpose: Ensure authenticated users can read their own RBAC rows for refresh-safe auth rehydration.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_own" ON public.profiles;
CREATE POLICY "profiles_read_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

ALTER TABLE public.agency_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "memberships_read_own" ON public.agency_memberships;
CREATE POLICY "memberships_read_own"
ON public.agency_memberships
FOR SELECT
TO authenticated
USING (user_id = auth.uid());
