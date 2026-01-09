# Troubleshooting Guide

## Issue 1: Profile Not Showing in Navigation

### Cause
The profile menu only appears for authenticated users. This is expected behavior.

### Solution
1. **Login**: Navigate to `/admin-access-8by2X` and log in
2. **Check Auth**: Open browser console (F12) and run:
   ```javascript
   localStorage.getItem('supabase.auth.token')
   ```
   If this returns `null`, you're not logged in.

3. **Verify Profile**:
   ```javascript
   // In browser console
   const { createClient } = window.supabase;
   const supabase = createClient(
     import.meta.env.VITE_SUPABASE_URL,
     import.meta.env.VITE_SUPABASE_ANON_KEY
   );
   const { data } = await supabase.auth.getUser();
   console.log(data);
   ```

### Expected Behavior
- **Not logged in**: No profile menu visible (correct)
- **Logged in**: Profile menu shows with name and role

---

## Issue 2: Preview Button Not Loading Stories

### Root Causes
1. Database migrations haven't been applied
2. RLS policies blocking anonymous access
3. View permissions not granted properly

### Quick Fix - Apply Migrations

**Step 1: Apply All Migrations**

In Supabase SQL Editor, run migrations in order:

```bash
# Via Supabase CLI
cd /home/user/quotesync
supabase db push

# Or manually in SQL Editor:
# 1. Run migrations/005_create_drafts_table.sql
# 2. Run migrations/006_add_archive_functionality.sql
# 3. Run migrations/007_hotfix_view_permissions.sql
```

**Step 2: Verify Migrations**

Run `DIAGNOSTIC.sql` in Supabase SQL Editor:

```sql
-- Check if all migrations applied
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'story_drafts'
) AS drafts_exist;

SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'stories'
  AND column_name = 'archived_at'
) AS archive_exist;

-- Test anonymous access
SET ROLE anon;
SELECT id, title, slug, status
FROM stories
WHERE status = 'published'
LIMIT 1;
RESET ROLE;
```

**Expected Output**:
- `drafts_exist`: `true`
- `archive_exist`: `true`
- Should see published stories in query results

---

## Detailed Diagnostics

### Test 1: Database State

```sql
-- Run in Supabase SQL Editor
\dt public.story_drafts;  -- Should exist
\d public.stories;        -- Should have archived_at, archived_by, previous_status columns
```

### Test 2: RLS Policies

```sql
-- Check policies
SELECT policyname, roles
FROM pg_policies
WHERE tablename = 'stories'
ORDER BY policyname;
```

**Expected policies**:
- `Anyone can view published stories` (role: `anon, public`)
- `Authenticated users can view non-archived stories` (role: `authenticated`)
- `Admins can view archived stories` (role: `authenticated`)

### Test 3: Frontend Preview

Open browser console on dashboard page:

```javascript
// Check if story has correct status
const storyWithEyeIcon = document.querySelector('a[title="View"]');
console.log('Preview link:', storyWithEyeIcon?.href);

// Should show: /news/[story-slug]
```

### Test 4: Story Detail Page

Manually navigate to a published story:
1. Get a story slug from dashboard
2. Navigate to `/news/[slug]`
3. Check browser console for errors

**Common errors**:
- **404/No story found**: Story isn't published
- **RLS policy error**: Migrations not applied
- **Undefined view**: `stories_with_authors` view missing

---

## Manual Fixes

### Fix 1: RLS Policy Override (Temporary)

If migrations can't be run immediately:

```sql
-- TEMPORARY: Allow anonymous access to published stories
ALTER TABLE public.stories DISABLE ROW LEVEL SECURITY;

-- Re-enable after migrations applied:
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
```

⚠️ **Warning**: Only use this temporarily for testing. Re-enable RLS immediately after.

### Fix 2: Recreate View Manually

```sql
-- Drop and recreate stories_with_authors
DROP VIEW IF EXISTS public.stories_with_authors CASCADE;

CREATE VIEW public.stories_with_authors AS
SELECT
  s.*,
  p.full_name AS author_name,
  p.email AS author_email
FROM public.stories s
LEFT JOIN public.profiles p ON s.author_id = p.id;

GRANT SELECT ON public.stories_with_authors TO anon, authenticated;
```

### Fix 3: Clear Browser Cache

Sometimes old JavaScript is cached:

1. Open DevTools (F12)
2. Right-click refresh button
3. Select "Empty Cache and Hard Reload"

---

## Verification Checklist

After applying fixes, verify:

- [ ] Migrations 005, 006, 007 applied successfully
- [ ] RLS policies show correct roles
- [ ] `stories_with_authors` view exists
- [ ] Anonymous users can query published stories
- [ ] Preview button links work (open in new tab)
- [ ] Story detail page loads correctly
- [ ] Profile menu shows when logged in

---

## Common Issues

### "Story not found" on preview
**Cause**: Story isn't published or RLS is blocking
**Fix**: Check story status in database:
```sql
SELECT id, title, status FROM stories WHERE slug = 'your-slug-here';
```

### Profile menu missing while logged in
**Cause**: Auth state not initialized
**Fix**:
1. Clear localStorage
2. Re-login at `/admin-access-8by2X`
3. Check browser console for errors in `AuthContext`

### Preview opens blank page
**Cause**: JavaScript error on story detail page
**Fix**:
1. Check browser console for errors
2. Verify story has all required fields (title, body, slug)
3. Check for null/undefined values in story data

---

## Need More Help?

1. **Check Logs**:
   - Browser console (F12 → Console)
   - Supabase Dashboard → Logs
   - Network tab (F12 → Network)

2. **Test Queries**: Run diagnostic queries in `DIAGNOSTIC.sql`

3. **Rollback**: If issues persist, rollback migrations:
   ```sql
   -- Rollback archive functionality
   ALTER TABLE stories DROP COLUMN IF EXISTS archived_at;
   ALTER TABLE stories DROP COLUMN IF EXISTS archived_by;
   ALTER TABLE stories DROP COLUMN IF EXISTS previous_status;
   DROP TABLE IF EXISTS story_drafts;
   ```

4. **Fresh Migration**: After rollback, re-apply migrations one by one

---

## Success Indicators

✅ Profile menu visible when logged in
✅ Preview button appears on published stories
✅ Clicking preview opens story in new tab
✅ Story detail page loads with all content
✅ No console errors
✅ Anonymous users can view published stories
✅ Authenticated users can access dashboard

If all indicators pass, the system is working correctly!
