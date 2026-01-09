-- Database Diagnostic Script
-- Run this in Supabase SQL Editor to check the current state

-- 1. Check if migrations have been applied
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'story_drafts'
  AND table_schema = 'public'
) AS drafts_table_exists;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'stories'
  AND column_name = 'archived_at'
  AND table_schema = 'public'
) AS archive_columns_exist;

-- 2. Check current RLS policies on stories
SELECT policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename = 'stories'
ORDER BY policyname;

-- 3. Check if stories_with_authors view exists and its definition
SELECT definition
FROM pg_views
WHERE viewname = 'stories_with_authors';

-- 4. Check published stories count (should be visible to all)
SELECT COUNT(*) as published_count
FROM stories
WHERE status = 'published';

-- 5. Test anonymous access to published stories (simulates preview)
SET ROLE anon;
SELECT id, title, slug, status
FROM stories
WHERE status = 'published'
LIMIT 5;
RESET ROLE;

-- 6. Check if there are any archived stories blocking view
SELECT COUNT(*) as archived_count
FROM stories
WHERE status = 'archived';

-- 7. Verify archive functions exist
SELECT proname
FROM pg_proc
WHERE proname IN ('archive_story', 'restore_story', 'permanently_delete_archived_story');
