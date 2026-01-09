-- Migration: Performance Optimization Indexes
-- Created: 2026-01-09
-- Purpose: Add indexes to improve query performance for common access patterns

-- Index for filtering stories by status (dashboard filters)
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);

-- Index for filtering by author_id (editor's own stories)
CREATE INDEX IF NOT EXISTS idx_stories_author_id ON stories(author_id);

-- Index for sorting by updated_at (dashboard default sort)
CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at DESC);

-- Index for published stories ordered by published_at (newsroom feed)
CREATE INDEX IF NOT EXISTS idx_stories_published ON stories(status, published_at DESC) WHERE status = 'published';

-- Index for featured stories (newsroom featured section)
CREATE INDEX IF NOT EXISTS idx_stories_featured ON stories(is_featured, published_at DESC) WHERE is_featured = true AND status = 'published';

-- Index for category filtering (newsroom category tabs)
CREATE INDEX IF NOT EXISTS idx_stories_category_published ON stories(category, published_at DESC) WHERE status = 'published';

-- Index for slug lookups (story detail pages)
CREATE INDEX IF NOT EXISTS idx_stories_slug ON stories(slug) WHERE status = 'published';

-- Index for profiles by role (admin user management)
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- Composite index for common dashboard query (status + updated_at)
CREATE INDEX IF NOT EXISTS idx_stories_status_updated ON stories(status, updated_at DESC);

-- Comments explaining the indexes
COMMENT ON INDEX idx_stories_status IS 'Speeds up dashboard filtering by status (draft, in_review, published)';
COMMENT ON INDEX idx_stories_author_id IS 'Speeds up filtering stories by author';
COMMENT ON INDEX idx_stories_updated_at IS 'Speeds up default dashboard sort by updated_at';
COMMENT ON INDEX idx_stories_published IS 'Optimizes newsroom feed query for published stories';
COMMENT ON INDEX idx_stories_featured IS 'Optimizes featured stories lookup in newsroom';
COMMENT ON INDEX idx_stories_category_published IS 'Speeds up category filtering in newsroom';
COMMENT ON INDEX idx_stories_slug IS 'Speeds up story detail page loads by slug';
COMMENT ON INDEX idx_profiles_role IS 'Speeds up role-based access checks';
COMMENT ON INDEX idx_stories_status_updated IS 'Optimizes combined status + date filtering';
