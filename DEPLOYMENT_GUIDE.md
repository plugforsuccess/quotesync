# Newsroom Deployment Guide

**Target:** Production deployment of insurance newsroom
**Prerequisites:** Supabase project created

---

## Migration Location

### Current Location
```
/migrations/002_create_newsroom_tables.sql
```

###

 Supabase CLI Standard
If using Supabase CLI (optional), migrations should be in:
```
/supabase/migrations/YYYYMMDDHHMMSS_create_newsroom_tables.sql
```

**Recommendation:** Keep current location for simplicity. Supabase dashboard accepts manual SQL execution.

---

## Deployment Steps

### Step 1: Set Up Supabase Project

1. **Create Supabase Project** (if not done)
   - Go to https://supabase.com/dashboard
   - Click "New Project"
   - Choose org, name, password, region
   - Wait ~2 minutes for provisioning

2. **Get API Credentials**
   - Go to Project Settings → API
   - Copy:
     - **Project URL:** `https://xxxxx.supabase.co`
     - **Anon Public Key:** `eyJhbGc...`

---

### Step 2: Run Database Migration

**Option A: Supabase Dashboard (Recommended for First Deploy)**

1. Open Supabase dashboard
2. Go to SQL Editor (left sidebar)
3. Click "New Query"
4. Copy entire contents of `migrations/002_create_newsroom_tables.sql`
5. Paste into editor
6. Click "Run" (bottom right)
7. **Expected Output:**
   ```
   Success. No rows returned
   ```

8. **Verify Tables Created:**
   - Go to Table Editor (left sidebar)
   - Should see:
     - `user_roles`
     - `stories`
     - `story_analytics`
     - `stories_with_stats` (view)

**Option B: Supabase CLI (Advanced)**

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link project
supabase link --project-ref xxxxx

# Run migration
supabase db push
```

**Option C: Direct PostgreSQL Connection**

```bash
# Get connection string from Project Settings → Database
psql postgresql://postgres:[password]@db.xxxxx.supabase.co:5432/postgres \
  -f migrations/002_create_newsroom_tables.sql
```

---

### Step 3: Create Admin User

1. **Sign Up First User** (via your app or Supabase Auth UI)
   - Go to Authentication → Users
   - Click "Invite User" OR sign up via `/signup` page
   - Note the User ID (UUID)

2. **Grant Admin Role**
   ```sql
   -- Run in Supabase SQL Editor
   INSERT INTO user_roles (user_id, role)
   VALUES ('your-user-uuid-here', 'admin');
   ```

3. **Verify**
   ```sql
   SELECT u.email, ur.role
   FROM auth.users u
   JOIN user_roles ur ON u.id = ur.user_id;
   ```

   **Expected:**
   ```
   email               | role
   -------------------+-------
   admin@example.com  | admin
   ```

---

### Step 4: Configure Environment Variables

1. **Create `.env` file** (local development)
   ```bash
   cp .env.example .env
   ```

2. **Fill in values:**
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   VITE_META_PIXEL_ID=1234567890
   ```

3. **Production Deployment (Vercel/Netlify):**
   - Add same variables in hosting dashboard
   - **DO NOT commit `.env` to git** (already in `.gitignore`)

---

### Step 5: Test Locally

```bash
# Install dependencies
npm install

# Run dev server
npm run dev

# Open browser
open http://localhost:5173/news
```

**Expected:**
- Newsroom tab appears in navigation
- Feed loads (empty initially)
- No console errors

---

### Step 6: Create First Story

1. Navigate to `/news/dashboard`
2. Should see empty dashboard
3. Click "New Story"
4. Fill in all required fields:
   - Title: "Test Story - Georgia Insurance Update"
   - Slug: "test-story-georgia-insurance"
   - Preview hook: "This is a test story to verify the newsroom is working."
   - Body: "Full article content goes here..."
   - Category: "Policy"
   - Region: "GA"

5. Click "Save Draft"
6. **Expected:** Success message

7. Go back to dashboard
8. Click publish button (green checkmark)
9. **Expected:** Status changes to "published"

10. Navigate to `/news`
11. **Expected:** Story appears in feed

---

### Step 7: Deploy to Production

#### Vercel Deployment

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy
vercel --prod
```

**Configure Environment Variables:**
1. Go to Vercel dashboard → Project → Settings → Environment Variables
2. Add all `VITE_*` variables
3. Redeploy

---

#### Netlify Deployment

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login
netlify login

# Deploy
netlify deploy --prod
```

**Configure Environment Variables:**
1. Go to Netlify dashboard → Site settings → Environment variables
2. Add all `VITE_*` variables
3. Redeploy

---

### Step 8: Verify Production Deployment

1. **Visit production newsroom:** `https://your-domain.com/news`
2. **Check feed loads**
3. **Check navigation tab appears**
4. **Test story page:** `https://your-domain.com/news/test-story-georgia-insurance`
5. **Verify SEO meta tags:**
   - View page source
   - Search for `<meta property="og:`
   - Should see populated tags

---

## Migration Rollback (If Needed)

### Undo Migration

```sql
-- Run in Supabase SQL Editor

-- Drop views
DROP VIEW IF EXISTS public.stories_with_stats;

-- Drop triggers
DROP TRIGGER IF EXISTS set_story_published_at ON public.stories;
DROP TRIGGER IF EXISTS update_stories_updated_at ON public.stories;
DROP TRIGGER IF EXISTS update_user_roles_updated_at ON public.user_roles;

-- Drop functions
DROP FUNCTION IF EXISTS set_published_at();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop policies (if RLS enabled)
DROP POLICY IF EXISTS "Anyone can view published stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can view all stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can create stories" ON public.stories;
DROP POLICY IF EXISTS "Editors can update their own drafts" ON public.stories;
DROP POLICY IF EXISTS "Admins can update any story" ON public.stories;
DROP POLICY IF EXISTS "Admins can delete stories" ON public.stories;
DROP POLICY IF EXISTS "Anyone can insert analytics" ON public.story_analytics;
DROP POLICY IF EXISTS "Admins can view analytics" ON public.story_analytics;
DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Drop indexes
DROP INDEX IF EXISTS idx_stories_status;
DROP INDEX IF EXISTS idx_stories_published_at;
DROP INDEX IF EXISTS idx_stories_category;
DROP INDEX IF EXISTS idx_stories_region;
DROP INDEX IF EXISTS idx_stories_slug;
DROP INDEX IF EXISTS idx_stories_featured;
DROP INDEX IF EXISTS idx_story_analytics_story_id;
DROP INDEX IF EXISTS idx_story_analytics_event_type;
DROP INDEX IF EXISTS idx_story_analytics_created_at;
DROP INDEX IF EXISTS idx_story_analytics_session;

-- Drop tables
DROP TABLE IF EXISTS public.story_analytics;
DROP TABLE IF EXISTS public.stories;
DROP TABLE IF EXISTS public.user_roles;
```

---

## Common Issues & Solutions

### Issue 1: "relation does not exist"
**Error:** `ERROR: relation "public.stories" does not exist`

**Solution:**
- Migration didn't run
- Re-run migration SQL in Supabase dashboard
- Check public schema is selected

---

### Issue 2: "permission denied for table"
**Error:** `permission denied for table stories`

**Solution:**
- RLS policies blocking access
- Verify user has role in `user_roles` table
- Check RLS policies are correct

---

### Issue 3: "Failed to fetch stories"
**Error:** Stories don't load in feed

**Solution:**
1. Check console for errors
2. Verify Supabase credentials in `.env`
3. Check network tab for 401/403 errors
4. Verify RLS policy allows SELECT on published stories

---

### Issue 4: "Can't access editor page"
**Error:** Redirected from `/news/editor`

**Solution:**
1. Verify user is logged in
2. Check user has role in `user_roles` table:
   ```sql
   SELECT * FROM user_roles WHERE user_id = 'your-user-id';
   ```
3. Grant editor or admin role if missing

---

### Issue 5: Meta tags not showing in social previews
**Error:** Facebook/Twitter don't show rich preview

**Solution:**
1. Use pre-rendering (see SEO_TESTING_GUIDE.md)
2. OR use prerender.io service
3. Verify meta tags in page source (View Source, not Inspect)

---

## Production Checklist

### Before Going Live
- [ ] Supabase project created
- [ ] Migration run successfully
- [ ] Admin user created
- [ ] Environment variables configured
- [ ] Test story published
- [ ] Feed loads correctly
- [ ] SEO meta tags present
- [ ] Analytics tracking verified
- [ ] RLS policies tested
- [ ] Video embeds work
- [ ] Mobile responsive

### Post-Launch
- [ ] Monitor Supabase dashboard for errors
- [ ] Check analytics events are flowing
- [ ] Verify social previews work
- [ ] Enable MFA for admin accounts
- [ ] Set up backup schedule (Supabase auto-backups daily)
- [ ] Document content publishing workflow

---

## Backup & Disaster Recovery

### Database Backups
**Supabase Pro Plan:**
- Automated daily backups
- 7-day retention
- One-click restore

**Manual Backup:**
```bash
# Export all stories
supabase db dump -f backup-$(date +%Y%m%d).sql

# Restore
psql connection_string -f backup-20260107.sql
```

### Rollback Strategy
1. Database: Restore from Supabase backup
2. Code: Revert git commit
3. Deploy: Push previous working version

---

## Monitoring

### Key Metrics
1. **Supabase Dashboard:**
   - API requests/minute
   - Database size
   - Auth users

2. **Error Logs:**
   - Check browser console
   - Check Supabase logs (Logs & Analytics)

3. **Performance:**
   - Page load time (Google Analytics)
   - API response time (Supabase metrics)

---

## Next Steps After Deployment

1. **Create 5-10 stories** to populate feed
2. **Share first story** on social media (test virality)
3. **Monitor analytics** for first 48 hours
4. **Optimize based on data:**
   - Which categories get most engagement?
   - Video vs no-video performance?
   - CTA click rates?

5. **Iterate on content strategy**

---

## Support Contacts

- **Supabase Issues:** https://supabase.com/support
- **Hosting (Vercel):** https://vercel.com/support
- **Hosting (Netlify):** https://netlify.com/support

---

## Conclusion

**Migration Path:**
1. Supabase project → 2. Run SQL migration → 3. Create admin → 4. Configure env → 5. Deploy

**Estimated Time:** 30 minutes total

**Rollback Time:** 5 minutes (drop tables + redeploy)

**Ready for Production:** YES ✅
