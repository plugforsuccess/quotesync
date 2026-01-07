-- Newsroom Database Schema
-- Creates tables for insurance newsroom with story management, video embeds, and analytics

-- ============================================
-- USERS & ROLES
-- ============================================

-- Extend auth.users with role information
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STORIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  preview_hook TEXT NOT NULL, -- 2-3 sentence preview
  body TEXT NOT NULL, -- Full article body (rich text/markdown)

  -- Categorization
  category TEXT NOT NULL CHECK (category IN ('litigation', 'law', 'accident', 'data', 'policy')),
  region TEXT, -- e.g., 'GA', 'ATL', or specific ZIP
  tags TEXT[], -- Additional tags for filtering

  -- Video
  video_type TEXT CHECK (video_type IN ('own_hosted', 'youtube_embed', 'x_embed', NULL)),
  video_url TEXT,
  video_thumbnail TEXT, -- URL to thumbnail image

  -- Attribution
  source_name TEXT, -- e.g., "WSB-TV Atlanta"
  source_url TEXT, -- Link to original source

  -- Publishing workflow
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'published', 'unpublished')),
  is_featured BOOLEAN DEFAULT FALSE, -- Pin to top of feed
  is_pinned BOOLEAN DEFAULT FALSE, -- Alternative to featured

  -- Metadata
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- SEO
  meta_title TEXT, -- Optional override for page title
  meta_description TEXT, -- Optional override for meta description
  og_image TEXT, -- OpenGraph image URL

  -- Indexes for performance
  CONSTRAINT valid_video CHECK (
    (video_type IS NULL AND video_url IS NULL) OR
    (video_type IS NOT NULL AND video_url IS NOT NULL)
  )
);

-- Indexes for fast queries
CREATE INDEX idx_stories_status ON public.stories(status);
CREATE INDEX idx_stories_published_at ON public.stories(published_at DESC) WHERE status = 'published';
CREATE INDEX idx_stories_category ON public.stories(category);
CREATE INDEX idx_stories_region ON public.stories(region);
CREATE INDEX idx_stories_slug ON public.stories(slug);
CREATE INDEX idx_stories_featured ON public.stories(is_featured) WHERE is_featured = TRUE;

-- ============================================
-- STORY ANALYTICS
-- ============================================

CREATE TABLE IF NOT EXISTS public.story_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID REFERENCES public.stories(id) ON DELETE CASCADE NOT NULL,

  -- Event tracking
  event_type TEXT NOT NULL CHECK (event_type IN (
    'feed_view',
    'story_impression',
    'video_play',
    'video_complete',
    'read_more_open',
    'cta_click',
    'share_click'
  )),

  -- Context
  user_session_id TEXT, -- Anonymous session tracking
  referrer TEXT, -- Where did they come from?
  cta_type TEXT, -- Which CTA was clicked?

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Additional context (JSON for flexibility)
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for analytics queries
CREATE INDEX idx_story_analytics_story_id ON public.story_analytics(story_id);
CREATE INDEX idx_story_analytics_event_type ON public.story_analytics(event_type);
CREATE INDEX idx_story_analytics_created_at ON public.story_analytics(created_at DESC);
CREATE INDEX idx_story_analytics_session ON public.story_analytics(user_session_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_analytics ENABLE ROW LEVEL SECURITY;

-- User Roles Policies
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Stories Policies - Public Read
CREATE POLICY "Anyone can view published stories"
  ON public.stories FOR SELECT
  USING (status = 'published');

-- Stories Policies - Editor Access
CREATE POLICY "Editors can view all stories"
  ON public.stories FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

CREATE POLICY "Editors can create stories"
  ON public.stories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
    )
  );

CREATE POLICY "Editors can update their own drafts"
  ON public.stories FOR UPDATE
  USING (
    author_id = auth.uid() AND
    status IN ('draft', 'review')
  );

-- Stories Policies - Admin Access
CREATE POLICY "Admins can update any story"
  ON public.stories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can delete stories"
  ON public.stories FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- Analytics Policies - Write Only
CREATE POLICY "Anyone can insert analytics"
  ON public.story_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view analytics"
  ON public.story_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stories_updated_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Auto-set published_at when status changes to published
CREATE OR REPLACE FUNCTION set_published_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'published' AND OLD.status != 'published' THEN
    NEW.published_at = NOW();
  ELSIF NEW.status != 'published' THEN
    NEW.published_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_story_published_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW
  EXECUTE FUNCTION set_published_at();

-- ============================================
-- HELPER VIEWS
-- ============================================

-- Published stories with view counts
CREATE OR REPLACE VIEW public.stories_with_stats AS
SELECT
  s.*,
  COUNT(DISTINCT CASE WHEN sa.event_type = 'story_impression' THEN sa.id END) as impression_count,
  COUNT(DISTINCT CASE WHEN sa.event_type = 'video_play' THEN sa.id END) as video_play_count,
  COUNT(DISTINCT CASE WHEN sa.event_type = 'read_more_open' THEN sa.id END) as read_more_count,
  COUNT(DISTINCT CASE WHEN sa.event_type = 'cta_click' THEN sa.id END) as cta_click_count
FROM public.stories s
LEFT JOIN public.story_analytics sa ON s.id = sa.story_id
WHERE s.status = 'published'
GROUP BY s.id;

-- Grant access to view
GRANT SELECT ON public.stories_with_stats TO anon, authenticated;

-- ============================================
-- SEED DATA (Optional - for testing)
-- ============================================

-- You can add seed data here for development
-- COMMENT: Run this manually or through your Supabase dashboard
