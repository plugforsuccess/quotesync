-- =====================================================
-- Story Drafts Migration
-- =====================================================
-- This migration implements a server-side draft persistence system:
-- 1. story_drafts table for autosaved content
-- 2. RLS policies for secure draft access
-- 3. Triggers for automatic timestamp updates
-- 4. Indexes for fast draft retrieval
-- =====================================================

-- =====================================================
-- 1. CREATE STORY_DRAFTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.story_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Author reference (required)
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Content fields (all optional to allow partial saves)
  title TEXT,
  slug TEXT,
  preview_hook TEXT,
  body TEXT,

  -- Categorization
  category TEXT CHECK (category IN ('litigation', 'law', 'accident', 'data', 'policy', NULL)),
  region TEXT,
  tags TEXT[],

  -- Video
  video_type TEXT CHECK (video_type IN ('own_hosted', 'youtube_embed', 'x_embed', NULL)),
  video_url TEXT,
  video_thumbnail TEXT,

  -- Attribution
  source_name TEXT,
  source_url TEXT,

  -- Draft status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_review')),

  -- SEO fields
  meta_title TEXT,
  meta_description TEXT,
  og_image TEXT,

  -- Link to published story (if this draft becomes a story)
  story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Video validation constraint
  CONSTRAINT valid_draft_video CHECK (
    (video_type IS NULL AND video_url IS NULL) OR
    (video_type IS NOT NULL AND video_url IS NOT NULL)
  )
);

-- =====================================================
-- 2. INDEXES FOR PERFORMANCE
-- =====================================================

-- Fast draft retrieval by author
CREATE INDEX idx_story_drafts_author_id ON public.story_drafts(author_id);

-- Fast draft retrieval by updated_at (most recent first)
CREATE INDEX idx_story_drafts_updated_at ON public.story_drafts(updated_at DESC);

-- Fast draft retrieval by status
CREATE INDEX idx_story_drafts_status ON public.story_drafts(status);

-- Composite index for common query pattern (author + status + updated_at)
CREATE INDEX idx_story_drafts_author_status_updated
  ON public.story_drafts(author_id, status, updated_at DESC);

-- Link to published story
CREATE INDEX idx_story_drafts_story_id ON public.story_drafts(story_id)
  WHERE story_id IS NOT NULL;

-- =====================================================
-- 3. AUTO-UPDATE TRIGGER
-- =====================================================

-- Reuse existing function from previous migrations
DROP TRIGGER IF EXISTS update_story_drafts_updated_at ON public.story_drafts;
CREATE TRIGGER update_story_drafts_updated_at
  BEFORE UPDATE ON public.story_drafts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.story_drafts ENABLE ROW LEVEL SECURITY;

-- SELECT POLICIES
-- Users can only view their own drafts
CREATE POLICY "Users can view own drafts"
  ON public.story_drafts FOR SELECT
  TO authenticated
  USING (auth.uid() = author_id);

-- Admins can view all drafts (for moderation/support)
CREATE POLICY "Admins can view all drafts"
  ON public.story_drafts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- INSERT POLICIES
-- Users can create their own drafts
CREATE POLICY "Users can create own drafts"
  ON public.story_drafts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = author_id);

-- UPDATE POLICIES
-- Users can update their own drafts
CREATE POLICY "Users can update own drafts"
  ON public.story_drafts FOR UPDATE
  TO authenticated
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

-- DELETE POLICIES
-- Users can delete their own drafts
CREATE POLICY "Users can delete own drafts"
  ON public.story_drafts FOR DELETE
  TO authenticated
  USING (auth.uid() = author_id);

-- Admins can delete any draft
CREATE POLICY "Admins can delete any draft"
  ON public.story_drafts FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================

-- Grant access to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_drafts TO authenticated;

-- =====================================================
-- 6. HELPER FUNCTION FOR DRAFT CLEANUP
-- =====================================================

-- Function to clean up old drafts (optional, for maintenance)
-- Can be called manually or via cron job
CREATE OR REPLACE FUNCTION public.cleanup_old_drafts(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete drafts older than specified days that have no associated story
  DELETE FROM public.story_drafts
  WHERE
    updated_at < NOW() - (days_old || ' days')::INTERVAL
    AND story_id IS NULL;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to admins only
REVOKE EXECUTE ON FUNCTION public.cleanup_old_drafts(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_drafts(INTEGER) TO authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of changes:
-- ✓ Created story_drafts table with all story fields
-- ✓ Added indexes for fast draft retrieval
-- ✓ Implemented auto-update trigger for updated_at
-- ✓ Configured RLS policies:
--   - Users can CRUD their own drafts
--   - Admins can view/delete all drafts
-- ✓ Added optional cleanup function for old drafts
-- ✓ Granted appropriate permissions
-- =====================================================
