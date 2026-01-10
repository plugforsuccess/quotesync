-- =====================================================
-- Fix Security Definer Views
-- =====================================================
-- This migration fixes views that were running with SECURITY DEFINER
-- (creator's permissions) instead of SECURITY INVOKER (querying user's
-- permissions). This ensures RLS policies are properly enforced.
--
-- Affected views:
-- - public.stories_with_stats
-- - public.stories_with_authors
-- - public.archived_stories
-- =====================================================

-- =====================================================
-- 1. FIX stories_with_stats VIEW
-- =====================================================
-- Set security_invoker to ensure RLS policies are enforced
ALTER VIEW public.stories_with_stats SET (security_invoker = true);

-- =====================================================
-- 2. FIX stories_with_authors VIEW
-- =====================================================
-- Set security_invoker to ensure RLS policies are enforced
ALTER VIEW public.stories_with_authors SET (security_invoker = true);

-- =====================================================
-- 3. FIX archived_stories VIEW
-- =====================================================
-- Set security_invoker to ensure RLS policies are enforced
ALTER VIEW public.archived_stories SET (security_invoker = true);

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of fixes:
-- - Set security_invoker = true on stories_with_stats
-- - Set security_invoker = true on stories_with_authors
-- - Set security_invoker = true on archived_stories
--
-- This ensures all views respect RLS policies of the querying user
-- rather than bypassing them with the view creator's permissions.
-- =====================================================
