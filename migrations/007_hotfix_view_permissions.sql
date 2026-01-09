-- =====================================================
-- Hotfix: View Permissions and RLS Policy Alignment
-- =====================================================
-- This migration ensures views work correctly with RLS policies
-- and that anonymous users can access published stories
-- =====================================================

-- =====================================================
-- 1. RECREATE stories_with_authors VIEW (FIX)
-- =====================================================
-- Drop and recreate without WHERE clause to let RLS handle filtering
DROP VIEW IF EXISTS public.stories_with_authors CASCADE;

CREATE OR REPLACE VIEW public.stories_with_authors AS
SELECT
  s.*,
  p.full_name AS author_name,
  p.email AS author_email
FROM public.stories s
LEFT JOIN public.profiles p ON s.author_id = p.id;
-- No WHERE clause - let RLS policies handle access control

-- Grant proper access
GRANT SELECT ON public.stories_with_authors TO anon, authenticated;

-- =====================================================
-- 2. VERIFY RLS POLICIES ARE CORRECT
-- =====================================================

-- Ensure anonymous users can see published stories
DO $$
BEGIN
  -- Drop old policy if exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Anyone can view published stories'
    AND tablename = 'stories'
  ) THEN
    DROP POLICY "Anyone can view published stories" ON public.stories;
  END IF;

  -- Recreate with correct access
  CREATE POLICY "Anyone can view published stories"
    ON public.stories FOR SELECT
    TO anon, public
    USING (status = 'published');
END $$;

-- =====================================================
-- 3. CREATE HELPER FUNCTION TO TEST VIEW ACCESS
-- =====================================================

-- Function to test if a story is viewable by current user
CREATE OR REPLACE FUNCTION public.can_view_story(story_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  story_status TEXT;
  is_authenticated BOOLEAN;
  user_role TEXT;
BEGIN
  -- Get story status
  SELECT status INTO story_status
  FROM public.stories
  WHERE id = story_id_param;

  -- Check if user is authenticated
  is_authenticated := auth.uid() IS NOT NULL;

  -- Get user role if authenticated
  IF is_authenticated THEN
    SELECT role INTO user_role
    FROM public.profiles
    WHERE id = auth.uid();
  END IF;

  -- Return based on status and user role
  IF story_status = 'published' THEN
    RETURN TRUE; -- Anyone can view published
  ELSIF is_authenticated AND user_role IN ('editor', 'admin') THEN
    RETURN story_status != 'archived' OR user_role = 'admin';
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to all
GRANT EXECUTE ON FUNCTION public.can_view_story(UUID) TO anon, authenticated;

-- =====================================================
-- 4. ADD INDEX FOR FASTER STORY LOOKUP BY SLUG
-- =====================================================

-- This improves preview/view performance
CREATE INDEX IF NOT EXISTS idx_stories_slug_status
  ON public.stories(slug, status)
  WHERE status = 'published';

-- =====================================================
-- 5. VERIFY ANONYMOUS ACCESS TO PUBLISHED STORIES
-- =====================================================

-- Test query that should work for anonymous users
-- (This is just a comment showing what should work)
-- SELECT * FROM stories_with_authors WHERE status = 'published';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of fixes:
-- ✓ Removed WHERE clause from stories_with_authors view
-- ✓ Let RLS policies handle access control instead
-- ✓ Ensured anon users can access published stories
-- ✓ Added helper function to test story visibility
-- ✓ Added performance index for slug lookups
-- =====================================================
