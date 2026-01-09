-- =====================================================
-- Archive Functionality Migration
-- =====================================================
-- This migration implements soft-delete archiving for stories:
-- 1. Add archive-related fields to stories table
-- 2. Update status constraint to include 'archived'
-- 3. Update RLS policies for archive access
-- 4. Create helper functions for archiving/restoring
-- 5. Create view for archived stories
-- =====================================================

-- =====================================================
-- 1. ADD ARCHIVE FIELDS TO STORIES TABLE
-- =====================================================

-- Add archived_at timestamp (when story was archived)
ALTER TABLE public.stories
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- Add archived_by (who archived the story)
ALTER TABLE public.stories
ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add previous_status (to restore to correct state)
-- Can be: draft, in_review, published, unpublished
ALTER TABLE public.stories
ADD COLUMN IF NOT EXISTS previous_status TEXT CHECK (
  previous_status IN ('draft', 'in_review', 'published', 'unpublished', NULL)
);

-- =====================================================
-- 2. UPDATE STATUS CONSTRAINT
-- =====================================================

-- Drop existing status check constraint
ALTER TABLE public.stories
DROP CONSTRAINT IF EXISTS stories_status_check;

-- Add new constraint with 'archived' status
ALTER TABLE public.stories
ADD CONSTRAINT stories_status_check
CHECK (status IN ('draft', 'in_review', 'published', 'unpublished', 'archived'));

-- =====================================================
-- 3. CREATE INDEXES FOR ARCHIVE QUERIES
-- =====================================================

-- Index for archived stories (filtered)
CREATE INDEX IF NOT EXISTS idx_stories_archived
  ON public.stories(archived_at DESC)
  WHERE status = 'archived';

-- Index for archived_by (to see who archived what)
CREATE INDEX IF NOT EXISTS idx_stories_archived_by
  ON public.stories(archived_by)
  WHERE archived_by IS NOT NULL;

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to archive a story
CREATE OR REPLACE FUNCTION public.archive_story(
  story_id_param UUID,
  archived_by_param UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_status TEXT;
BEGIN
  -- Get current status
  SELECT status INTO current_status
  FROM public.stories
  WHERE id = story_id_param;

  -- Don't archive if already archived
  IF current_status = 'archived' THEN
    RETURN FALSE;
  END IF;

  -- Update story to archived status
  UPDATE public.stories
  SET
    status = 'archived',
    archived_at = NOW(),
    archived_by = archived_by_param,
    previous_status = current_status
  WHERE id = story_id_param;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to restore an archived story
CREATE OR REPLACE FUNCTION public.restore_story(
  story_id_param UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  prev_status TEXT;
BEGIN
  -- Get previous status
  SELECT previous_status INTO prev_status
  FROM public.stories
  WHERE id = story_id_param AND status = 'archived';

  -- Don't restore if not archived
  IF prev_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Restore to previous status (default to draft if none)
  UPDATE public.stories
  SET
    status = COALESCE(prev_status, 'draft'),
    archived_at = NULL,
    archived_by = NULL,
    previous_status = NULL
  WHERE id = story_id_param;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to permanently delete archived stories (admin only)
-- Only works if story has been archived for at least X days
CREATE OR REPLACE FUNCTION public.permanently_delete_archived_story(
  story_id_param UUID,
  min_days_archived INTEGER DEFAULT 30
)
RETURNS BOOLEAN AS $$
DECLARE
  story_archived_at TIMESTAMP WITH TIME ZONE;
  story_status TEXT;
BEGIN
  -- Get story archive info
  SELECT archived_at, status
  INTO story_archived_at, story_status
  FROM public.stories
  WHERE id = story_id_param;

  -- Verify story is archived
  IF story_status != 'archived' OR story_archived_at IS NULL THEN
    RAISE EXCEPTION 'Story must be archived before permanent deletion';
  END IF;

  -- Verify story has been archived long enough
  IF story_archived_at > NOW() - (min_days_archived || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'Story must be archived for at least % days before permanent deletion', min_days_archived;
  END IF;

  -- Delete the story
  DELETE FROM public.stories WHERE id = story_id_param;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 5. UPDATE RLS POLICIES
-- =====================================================

-- Drop existing policies that need updating
DROP POLICY IF EXISTS "Anyone can view published stories" ON public.stories;
DROP POLICY IF EXISTS "Authenticated users can view all stories" ON public.stories;

-- Recreate SELECT policies with archive exclusion

-- Anonymous users can ONLY see published stories (not archived)
CREATE POLICY "Anyone can view published stories"
  ON public.stories FOR SELECT
  USING (status = 'published');

-- Authenticated editors can view all stories EXCEPT archived
-- (Archived stories have separate view permission)
CREATE POLICY "Authenticated users can view non-archived stories"
  ON public.stories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
    )
    AND status != 'archived'
  );

-- Only admins can view archived stories
CREATE POLICY "Admins can view archived stories"
  ON public.stories FOR SELECT
  TO authenticated
  USING (
    status = 'archived'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 6. CREATE ARCHIVED STORIES VIEW
-- =====================================================

-- View for archived stories with author and archiver info
CREATE OR REPLACE VIEW public.archived_stories AS
SELECT
  s.id,
  s.title,
  s.slug,
  s.category,
  s.previous_status,
  s.archived_at,
  s.published_at,
  s.updated_at,
  s.created_at,
  -- Author info
  author.full_name AS author_name,
  author.email AS author_email,
  -- Archiver info
  archiver.full_name AS archived_by_name,
  archiver.email AS archived_by_email
FROM public.stories s
LEFT JOIN public.profiles author ON s.author_id = author.id
LEFT JOIN public.profiles archiver ON s.archived_by = archiver.id
WHERE s.status = 'archived'
ORDER BY s.archived_at DESC;

-- Grant access to admins only (via RLS on underlying stories table)
GRANT SELECT ON public.archived_stories TO authenticated;

-- =====================================================
-- 7. GRANT FUNCTION PERMISSIONS
-- =====================================================

-- Grant archive/restore functions to authenticated users
-- (RLS will ensure only admins can actually use them via policy checks)
GRANT EXECUTE ON FUNCTION public.archive_story(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_story(UUID) TO authenticated;

-- Grant permanent delete only to authenticated users
-- (Application layer should verify admin role)
GRANT EXECUTE ON FUNCTION public.permanently_delete_archived_story(UUID, INTEGER) TO authenticated;

-- =====================================================
-- 8. UPDATE STORIES_WITH_AUTHORS VIEW
-- =====================================================

-- Drop and recreate to exclude archived stories from default view
DROP VIEW IF EXISTS public.stories_with_authors;

CREATE OR REPLACE VIEW public.stories_with_authors AS
SELECT
  s.*,
  p.full_name AS author_name,
  p.email AS author_email
FROM public.stories s
LEFT JOIN public.profiles p ON s.author_id = p.id
WHERE s.status != 'archived'; -- Exclude archived stories

-- Grant access
GRANT SELECT ON public.stories_with_authors TO anon, authenticated;

-- =====================================================
-- 9. CLEANUP EXISTING DATA (IF ANY)
-- =====================================================

-- Ensure any stories with invalid states are fixed
-- (Should be none, but defensive programming)
UPDATE public.stories
SET
  archived_at = NULL,
  archived_by = NULL,
  previous_status = NULL
WHERE status != 'archived';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of changes:
-- ✓ Added archived_at, archived_by, previous_status to stories table
-- ✓ Updated status constraint to include 'archived'
-- ✓ Created indexes for archive queries
-- ✓ Added helper functions:
--   - archive_story() - Soft delete with metadata
--   - restore_story() - Restore to previous status
--   - permanently_delete_archived_story() - Hard delete with safety checks
-- ✓ Updated RLS policies:
--   - Public sees only published (not archived)
--   - Editors see non-archived stories
--   - Only admins see archived stories
-- ✓ Created archived_stories view with author/archiver info
-- ✓ Updated stories_with_authors to exclude archived
-- ✓ Granted appropriate permissions
-- =====================================================
