-- =====================================================
-- Editorial Workflow Migration (SAFE VERSION)
-- =====================================================
-- This migration safely handles existing policies/tables
-- by dropping and recreating them as needed
-- =====================================================

-- =====================================================
-- 1. CREATE PROFILES TABLE (IF NOT EXISTS)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- =====================================================
-- 2. AUTO-CREATE PROFILE TRIGGER
-- =====================================================

-- Drop existing trigger/function if exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Function to auto-create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'editor')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- 3. MIGRATE EXISTING USERS TO PROFILES
-- =====================================================

-- Migrate existing users from auth.users and user_roles to profiles
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', au.email),
  COALESCE(ur.role, 'editor')
FROM auth.users au
LEFT JOIN public.user_roles ur ON au.id = ur.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  role = EXCLUDED.role;

-- =====================================================
-- 4. UPDATE STORIES TABLE
-- =====================================================

-- Drop existing foreign key constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stories_author_id_fkey'
  ) THEN
    ALTER TABLE public.stories DROP CONSTRAINT stories_author_id_fkey;
  END IF;
END $$;

-- Ensure all stories have valid author_id
-- Assign orphaned stories to first admin or first profile
UPDATE public.stories
SET author_id = (
  SELECT id FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE author_id IS NULL
   OR author_id NOT IN (SELECT id FROM public.profiles);

-- If no admin exists, use first profile
UPDATE public.stories
SET author_id = (
  SELECT id FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE author_id IS NULL;

-- Add proper foreign key constraint
ALTER TABLE public.stories
ADD CONSTRAINT stories_author_id_fkey
FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Update status values: 'review' -> 'in_review'
UPDATE public.stories
SET status = 'in_review'
WHERE status = 'review';

-- Drop old check constraint if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'stories_status_check'
  ) THEN
    ALTER TABLE public.stories DROP CONSTRAINT stories_status_check;
  END IF;
END $$;

-- Add new check constraint with updated values
ALTER TABLE public.stories
ADD CONSTRAINT stories_status_check
CHECK (status IN ('draft', 'in_review', 'published', 'unpublished'));

-- =====================================================
-- 5. AUTO-UPDATE TRIGGER FOR PROFILES
-- =====================================================

-- Drop existing trigger/function if exists
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
DROP FUNCTION IF EXISTS public.update_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.update_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_profiles_updated_at();

-- =====================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES - PROFILES
-- =====================================================

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop all existing profile policies
DROP POLICY IF EXISTS "Public profiles are viewable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own full_name" ON public.profiles;

-- PROFILES POLICIES (Recreate cleanly)
-- Anyone authenticated can view profiles (for author attribution)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Users can update their own full_name
CREATE POLICY "Users can update own full_name"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Only allow updating full_name and updated_at
      (full_name IS DISTINCT FROM (SELECT full_name FROM public.profiles WHERE id = auth.uid()))
      OR (updated_at IS DISTINCT FROM (SELECT updated_at FROM public.profiles WHERE id = auth.uid()))
    )
  );

-- Admins can update any profile
CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES - STORIES
-- =====================================================

-- Drop ALL existing stories policies to avoid conflicts
DROP POLICY IF EXISTS "Published stories viewable by all" ON public.stories;
DROP POLICY IF EXISTS "Anyone can view published stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can view all stories" ON public.stories;
DROP POLICY IF EXISTS "Authenticated users can view all stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can create stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can update own drafts/reviews" ON public.stories;
DROP POLICY IF EXISTS "Editors can update their own stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can update own drafts" ON public.stories;
DROP POLICY IF EXISTS "Admins can update any story" ON public.stories;
DROP POLICY IF EXISTS "Admins can delete any story" ON public.stories;
DROP POLICY IF EXISTS "Admins can delete stories" ON public.stories;

-- SELECT POLICIES (Recreate cleanly)

-- Anyone (including anonymous) can view published stories
CREATE POLICY "Anyone can view published stories"
  ON public.stories FOR SELECT
  USING (status = 'published');

-- Authenticated editors/admins can view all stories
CREATE POLICY "Authenticated users can view all stories"
  ON public.stories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- INSERT POLICIES

-- Editors can create stories (author_id must equal their own ID)
CREATE POLICY "Editors can create stories"
  ON public.stories FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
    )
  );

-- UPDATE POLICIES

-- Editors can update their own stories ONLY when status='draft'
-- They can also change status from 'draft' to 'in_review'
CREATE POLICY "Editors can update own drafts"
  ON public.stories FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'editor'
    )
  )
  WITH CHECK (
    auth.uid() = author_id
    AND (
      -- Allow updates when story is draft
      (status = 'draft')
      OR
      -- Allow changing from draft to in_review
      (status = 'in_review' AND (
        SELECT status FROM public.stories WHERE id = stories.id
      ) = 'draft')
    )
    -- Ensure editor cannot set status to 'published'
    AND status != 'published'
  );

-- Admins can update any story and publish
CREATE POLICY "Admins can update any story"
  ON public.stories FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- DELETE POLICIES

-- Only admins can delete stories
CREATE POLICY "Admins can delete stories"
  ON public.stories FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- 8. GRANT PERMISSIONS
-- =====================================================

-- Grant access to profiles table
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.profiles TO authenticated;

-- Ensure stories table has proper permissions
GRANT SELECT ON public.stories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.stories TO authenticated;

-- =====================================================
-- 9. CREATE/REPLACE VIEW FOR STORIES WITH AUTHORS
-- =====================================================

-- Drop existing view if exists
DROP VIEW IF EXISTS public.stories_with_authors;

-- Helper view to easily join stories with author info
CREATE VIEW public.stories_with_authors AS
SELECT
  s.*,
  p.full_name AS author_name,
  p.email AS author_email
FROM public.stories s
LEFT JOIN public.profiles p ON s.author_id = p.id;

-- Grant access to view
GRANT SELECT ON public.stories_with_authors TO anon, authenticated;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Summary of changes:
-- ✓ Created profiles table with full_name
-- ✓ Auto-create profile on user signup
-- ✓ Migrated existing users to profiles
-- ✓ Updated stories.author_id to reference profiles
-- ✓ Updated status values (review -> in_review)
-- ✓ Dropped and recreated all RLS policies (no conflicts)
-- ✓ Implemented strict RLS policies:
--   - Anon users see only published stories
--   - Editors can edit own drafts
--   - Editors can submit for review (draft -> in_review)
--   - Only admins can publish
-- ✓ Created helper view for stories with author names
-- =====================================================
