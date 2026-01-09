-- =====================================================
-- Migration 008: Fix RLS policy recursion on stories table
-- =====================================================
-- Issue: "Editors can update own drafts" policy contains a subquery
-- that references the stories table, causing infinite recursion
-- when Supabase re-evaluates RLS on the subquery.
-- =====================================================

-- Drop the problematic policy
DROP POLICY IF EXISTS "Editors can update own drafts" ON public.stories;

-- Recreate without recursive subquery
-- The fix: Remove the subquery that checks old status.
-- Instead, rely on USING clause to limit which rows can be updated
-- and WITH CHECK to validate the new values.
CREATE POLICY "Editors can update own drafts"
  ON public.stories FOR UPDATE
  TO authenticated
  USING (
    -- Editor can only update stories they authored that are draft or in_review
    auth.uid() = author_id
    AND status IN ('draft', 'in_review')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'editor'
    )
  )
  WITH CHECK (
    -- After update, story must still belong to them
    auth.uid() = author_id
    -- Status can only be draft or in_review (no direct publish)
    AND status IN ('draft', 'in_review')
  );
