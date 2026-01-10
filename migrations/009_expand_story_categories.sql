-- =====================================================
-- Migration 009: Expand Story Categories
-- =====================================================
-- This migration:
-- 1. Creates reference tables for categories and tags (extensibility)
-- 2. Adds secondary_tags column to stories
-- 3. Migrates existing stories to new category structure
-- 4. Updates constraints to support new categories
-- =====================================================

-- =====================================================
-- 1. CREATE CATEGORY REFERENCE TABLE
-- =====================================================
-- This table allows future category management through admin UI
-- without requiring code changes or migrations

CREATE TABLE IF NOT EXISTS public.story_category_definitions (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert the new category definitions
INSERT INTO public.story_category_definitions (slug, label, description, sort_order) VALUES
  ('policy-regulation', 'Policy & Regulation', 'Insurance policy updates, regulatory changes, and government oversight', 1),
  ('litigation-legal', 'Litigation & Legal', 'Lawsuits, court decisions, settlements, and legal precedents', 2),
  ('accidents-claims', 'Accidents & Claims', 'Accident trends, claims data, safety statistics, and incident reports', 3),
  ('insurance-markets', 'Insurance Markets', 'Market trends, rate changes, carrier financials, and industry movements', 4),
  ('data-research', 'Data & Research', 'Data-driven insights, studies, statistics, and analytical reports', 5),
  ('consumer-guidance', 'Consumer Guidance', 'Tips, advice, how-tos, and educational content for policyholders', 6),
  ('industry-carriers', 'Industry & Carriers', 'Insurance company news, mergers, executive moves, and industry updates', 7),
  ('weather-catastrophe', 'Weather & Catastrophe', 'Storm damage, natural disasters, climate impact, and catastrophe claims', 8),
  ('technology-ai', 'Technology & AI', 'Insurtech, AI in insurance, telematics, digital tools, and innovation', 9)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- =====================================================
-- 2. CREATE TAG REFERENCE TABLE
-- =====================================================
-- Predefined tags for optional secondary categorization

CREATE TABLE IF NOT EXISTS public.story_tag_definitions (
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert predefined tags
INSERT INTO public.story_tag_definitions (slug, label, description, sort_order) VALUES
  ('breaking', 'Breaking News', 'Time-sensitive, just-in news', 1),
  ('exclusive', 'Exclusive', 'Original reporting or exclusive access', 2),
  ('analysis', 'Analysis', 'In-depth analysis of trends or events', 3),
  ('opinion', 'Opinion', 'Editorial opinion or commentary', 4),
  ('explainer', 'Explainer', 'Educational content explaining concepts', 5),
  ('investigation', 'Investigation', 'Investigative journalism pieces', 6),
  ('press-release', 'Press Release', 'Company or organization announcements', 7),
  ('local', 'Local', 'Local/regional focus', 8),
  ('national', 'National', 'National scope coverage', 9),
  ('sponsored', 'Sponsored', 'Sponsored or partner content', 10)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- =====================================================
-- 3. ADD SECONDARY_TAGS COLUMN TO STORIES
-- =====================================================
-- Optional multi-select tags for additional categorization
-- Using TEXT[] for flexibility (can reference tag_definitions or be free-form)

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS secondary_tags TEXT[] DEFAULT '{}';

ALTER TABLE public.story_drafts
  ADD COLUMN IF NOT EXISTS secondary_tags TEXT[] DEFAULT '{}';

-- =====================================================
-- 4. MIGRATE EXISTING STORIES TO NEW CATEGORIES
-- =====================================================
-- Map legacy categories to new taxonomy:
-- policy → policy-regulation
-- law → litigation-legal
-- litigation → litigation-legal
-- accident → accidents-claims
-- data → data-research

-- First, drop the existing constraint on stories
ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_category_check;

-- Migrate existing story categories
UPDATE public.stories SET category = 'policy-regulation' WHERE category = 'policy';
UPDATE public.stories SET category = 'litigation-legal' WHERE category = 'law';
UPDATE public.stories SET category = 'litigation-legal' WHERE category = 'litigation';
UPDATE public.stories SET category = 'accidents-claims' WHERE category = 'accident';
UPDATE public.stories SET category = 'data-research' WHERE category = 'data';

-- Add new constraint with all categories
ALTER TABLE public.stories
  ADD CONSTRAINT stories_category_check CHECK (
    category IN (
      'policy-regulation',
      'litigation-legal',
      'accidents-claims',
      'insurance-markets',
      'data-research',
      'consumer-guidance',
      'industry-carriers',
      'weather-catastrophe',
      'technology-ai'
    )
  );

-- =====================================================
-- 5. MIGRATE STORY_DRAFTS TABLE
-- =====================================================

-- Drop existing constraint on drafts
ALTER TABLE public.story_drafts
  DROP CONSTRAINT IF EXISTS story_drafts_category_check;

-- Migrate existing draft categories
UPDATE public.story_drafts SET category = 'policy-regulation' WHERE category = 'policy';
UPDATE public.story_drafts SET category = 'litigation-legal' WHERE category = 'law';
UPDATE public.story_drafts SET category = 'litigation-legal' WHERE category = 'litigation';
UPDATE public.story_drafts SET category = 'accidents-claims' WHERE category = 'accident';
UPDATE public.story_drafts SET category = 'data-research' WHERE category = 'data';

-- Add new constraint with all categories (allowing NULL for drafts)
ALTER TABLE public.story_drafts
  ADD CONSTRAINT story_drafts_category_check CHECK (
    category IS NULL OR category IN (
      'policy-regulation',
      'litigation-legal',
      'accidents-claims',
      'insurance-markets',
      'data-research',
      'consumer-guidance',
      'industry-carriers',
      'weather-catastrophe',
      'technology-ai'
    )
  );

-- =====================================================
-- 6. CREATE INDEXES FOR NEW COLUMNS
-- =====================================================

-- GIN index for secondary_tags array search
CREATE INDEX IF NOT EXISTS idx_stories_secondary_tags ON public.stories USING GIN (secondary_tags);
CREATE INDEX IF NOT EXISTS idx_story_drafts_secondary_tags ON public.story_drafts USING GIN (secondary_tags);

-- Index on category_definitions for lookups
CREATE INDEX IF NOT EXISTS idx_story_category_definitions_active ON public.story_category_definitions(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_story_tag_definitions_active ON public.story_tag_definitions(is_active) WHERE is_active = TRUE;

-- =====================================================
-- 7. ROW LEVEL SECURITY FOR REFERENCE TABLES
-- =====================================================

-- Enable RLS on reference tables
ALTER TABLE public.story_category_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_tag_definitions ENABLE ROW LEVEL SECURITY;

-- Everyone can read category/tag definitions
CREATE POLICY "Anyone can read category definitions"
  ON public.story_category_definitions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read tag definitions"
  ON public.story_tag_definitions FOR SELECT
  USING (true);

-- Only admins can modify category/tag definitions
CREATE POLICY "Admins can manage category definitions"
  ON public.story_category_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage tag definitions"
  ON public.story_tag_definitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

GRANT SELECT ON public.story_category_definitions TO anon, authenticated;
GRANT SELECT ON public.story_tag_definitions TO anon, authenticated;
GRANT ALL ON public.story_category_definitions TO authenticated;
GRANT ALL ON public.story_tag_definitions TO authenticated;

-- =====================================================
-- 9. UPDATE TRIGGERS FOR REFERENCE TABLES
-- =====================================================

-- Auto-update updated_at for category definitions
CREATE TRIGGER update_story_category_definitions_updated_at
  BEFORE UPDATE ON public.story_category_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-update updated_at for tag definitions
CREATE TRIGGER update_story_tag_definitions_updated_at
  BEFORE UPDATE ON public.story_tag_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of changes:
-- ✓ Created story_category_definitions reference table
-- ✓ Created story_tag_definitions reference table
-- ✓ Added secondary_tags column to stories and story_drafts
-- ✓ Migrated existing categories to new taxonomy:
--   - policy → policy-regulation
--   - law → litigation-legal
--   - litigation → litigation-legal
--   - accident → accidents-claims
--   - data → data-research
-- ✓ Updated constraints with all 9 new categories
-- ✓ Added GIN indexes for tag array searches
-- ✓ Configured RLS policies for reference tables
-- =====================================================
