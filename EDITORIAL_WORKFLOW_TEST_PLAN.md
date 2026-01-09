# Editorial Workflow Test Plan

## Overview
This test plan covers the implementation of the editorial workflow where stories must be reviewed by Admin before publication, and public author credit always stays with the original editor.

---

## Prerequisites

### Database Setup
1. Run the SQL migration in Supabase:
   ```sql
   -- Execute: /migrations/003_editorial_workflow.sql
   ```

2. Create test users in Supabase Auth:
   - **Editor User**: `editor@example.com` (role: 'editor')
   - **Admin User**: `admin@example.com` (role: 'admin')

3. Update profiles table with full names:
   ```sql
   UPDATE profiles SET full_name = 'John Editor' WHERE email = 'editor@example.com';
   UPDATE profiles SET full_name = 'Jane Admin' WHERE email = 'admin@example.com';
   ```

---

## Test Scenarios

### 1. User Profile Display

#### Test 1.1: Editor sees their full name in header
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Navigate to `/news/dashboard`
3. Check the user menu in the header

**Expected**:
- ✅ User menu shows "John Editor" (not email)
- ✅ Dropdown shows full name with email below
- ✅ Role badge shows "editor"

#### Test 1.2: Admin sees their full name in header
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Navigate to `/news/dashboard`
3. Check the user menu in the header

**Expected**:
- ✅ User menu shows "Jane Admin" (not email)
- ✅ Dropdown shows full name with email below
- ✅ Role badge shows "admin"

---

### 2. Story Creation & Author Attribution

#### Test 2.1: Editor creates a new story
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Navigate to `/news/editor` (new story)
3. Fill in all required fields:
   - Title: "Test Story by Editor"
   - Preview Hook: "This is a test story created by an editor."
   - Body: "Full story content goes here."
   - Category: Select any category
   - Meta Title: Auto-populated (verify)
   - Meta Description: Auto-populated (verify)
4. Click "Save Draft"

**Expected**:
- ✅ Story is created with status = 'draft'
- ✅ `author_id` is set to editor's profile ID
- ✅ Success message displayed
- ✅ Redirected to edit page for the story

#### Test 2.2: Verify author_id is immutable
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Open the story created by editor in step 2.1
3. Try to edit and save the story

**Expected**:
- ✅ Story saves successfully
- ✅ `author_id` remains unchanged (still references editor)
- ✅ Database constraint prevents author_id modification

---

### 3. Editorial Workflow: Draft → In Review → Published

#### Test 3.1: Editor submits story for review
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Navigate to `/news/dashboard`
3. Open a draft story
4. Click "Submit for Review"

**Expected**:
- ✅ Story status changes to 'in_review'
- ✅ Success message displayed
- ✅ Story appears in "In Review" filter on dashboard
- ✅ Story count on dashboard updates (Drafts -1, In Review +1)

#### Test 3.2: Editor cannot edit content while in review
**User**: Editor (editor@example.com)
**Steps**:
1. Open a story with status = 'in_review'
2. Try to edit title, body, or other content fields

**Expected**:
- ✅ Yellow warning banner displayed: "Story is under review. Content cannot be edited..."
- ✅ All content fields are disabled (grayed out)
- ✅ "Save Draft" and "Submit for Review" buttons are hidden
- ✅ Only Preview and Back buttons are available

#### Test 3.3: Admin can publish story
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Navigate to `/news/dashboard`
3. Click "In Review" filter tab
4. Locate story submitted by editor
5. Click the Publish button (green checkmark icon)

**Expected**:
- ✅ Story status changes to 'published'
- ✅ `published_at` timestamp is set automatically
- ✅ Success message displayed
- ✅ Story moves to "Published" tab
- ✅ Story count updates (In Review -1, Published +1)

#### Test 3.4: Editor cannot publish their own stories
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Navigate to `/news/dashboard`
3. Look for publish/unpublish buttons

**Expected**:
- ✅ No publish/unpublish buttons visible for editor
- ✅ Only Edit and View buttons are available
- ✅ Database RLS policy prevents publish action even if attempted via API

#### Test 3.5: Admin can return story to draft (unpublish)
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Navigate to `/news/dashboard`
3. Find a published story
4. Click the Unpublish button (red X icon)

**Expected**:
- ✅ Story status changes to 'draft'
- ✅ Confirmation message displayed
- ✅ Story removed from public newsroom feed
- ✅ Editor can now edit the story again

---

### 4. Public Author Byline Display

#### Test 4.1: Public story page shows author name
**User**: Anonymous (public user)
**Steps**:
1. Navigate to `/news` (public newsroom)
2. Click on a published story
3. Check the byline below the title

**Expected**:
- ✅ Byline shows: "By John Editor" (original author's full_name)
- ✅ NO "Published by" or "Approved by" text anywhere on page
- ✅ Byline appears even if admin published the story
- ✅ If author has no full_name, byline should fall back gracefully

#### Test 4.2: Story cards show author name in feed
**User**: Anonymous (public user)
**Steps**:
1. Navigate to `/news` (public newsroom feed)
2. Scroll through story cards

**Expected**:
- ✅ Each story card shows "By [Author Name]" below the headline
- ✅ Author attribution is visible and clear
- ✅ NO admin name or "published by" text

#### Test 4.3: Admin-published story still credits original editor
**User**: Anonymous (public user)
**Steps**:
1. Find a story that was:
   - Created by Editor (John Editor)
   - Published by Admin (Jane Admin)
2. View the full story page

**Expected**:
- ✅ Byline shows: "By John Editor" (NOT Jane Admin)
- ✅ Only the original author receives credit
- ✅ No indication of who approved/published

---

### 5. Row Level Security (RLS) Enforcement

#### Test 5.1: Anonymous users can only see published stories
**User**: Anonymous (not logged in)
**Steps**:
1. Open browser in incognito mode
2. Navigate to `/news`
3. Try to access draft/in_review stories directly via URL

**Expected**:
- ✅ Only published stories appear in feed
- ✅ Draft/in_review stories return 404 or "not found"
- ✅ Database RLS policy blocks access at query level

#### Test 5.2: Editor can only update their own drafts
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Create a draft story (Story A)
3. Log out and log in as a different editor
4. Try to edit Story A

**Expected**:
- ✅ Editor cannot see or edit stories created by other editors if status = 'draft'
- ✅ Database RLS policy enforces author_id check
- ✅ Editor can view all stories but cannot modify others' drafts

#### Test 5.3: Editor cannot set status to 'published'
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Create or open a draft story
3. Attempt to manually set status to 'published' (via browser dev tools or API call)

**Expected**:
- ✅ Database RLS policy rejects the update
- ✅ Error message returned
- ✅ Status remains 'draft' or 'in_review'

#### Test 5.4: Admin can update any story
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Edit a story created by editor
3. Change title, status, or other fields
4. Save changes

**Expected**:
- ✅ All changes save successfully
- ✅ Admin has full access to all stories
- ✅ Author attribution remains with original editor

---

### 6. Content Immutability While In Review

#### Test 6.1: Editor cannot modify content while in review
**User**: Editor (editor@example.com)
**Steps**:
1. Submit a story for review (status = 'in_review')
2. Try to edit the title or body

**Expected**:
- ✅ Fields are disabled with gray background
- ✅ Warning banner displayed
- ✅ Changes cannot be saved

#### Test 6.2: Admin can edit content while in review
**User**: Admin (admin@example.com)
**Steps**:
1. Open a story with status = 'in_review'
2. Edit title, body, or other fields
3. Save changes

**Expected**:
- ✅ Admin can edit all fields (no restrictions)
- ✅ Changes save successfully
- ✅ Status remains 'in_review' (unless admin explicitly publishes)

---

### 7. Dashboard & Review Queue

#### Test 7.1: Dashboard shows correct story counts
**User**: Editor or Admin
**Steps**:
1. Log in
2. Navigate to `/news/dashboard`
3. Check the stats cards at the top

**Expected**:
- ✅ Total Stories count is accurate
- ✅ Published count matches published stories
- ✅ In Review count matches stories with status = 'in_review'
- ✅ Drafts count matches draft stories

#### Test 7.2: Filter tabs work correctly
**User**: Editor or Admin
**Steps**:
1. Navigate to `/news/dashboard`
2. Click each filter tab:
   - All Stories
   - Drafts
   - In Review
   - Published

**Expected**:
- ✅ Each filter shows only stories with matching status
- ✅ Tab highlights when active (blue background)
- ✅ Story table updates immediately

#### Test 7.3: In Review tab shows only pending stories
**User**: Admin (admin@example.com)
**Steps**:
1. Log in as admin
2. Navigate to `/news/dashboard`
3. Click "In Review" tab

**Expected**:
- ✅ Only stories with status = 'in_review' are displayed
- ✅ Stories show yellow badge: "in review"
- ✅ Publish button (green checkmark) is visible for each story

---

### 8. Edge Cases & Error Handling

#### Test 8.1: Story with missing author profile
**User**: Admin (admin@example.com)
**Steps**:
1. Manually delete a profile from the database (or orphan a story)
2. View the story on the public feed or detail page

**Expected**:
- ✅ Story still displays (no crash)
- ✅ Byline gracefully handles missing author (shows nothing or "Unknown Author")
- ✅ No errors in console

#### Test 8.2: Editor tries to bypass RLS with API calls
**User**: Editor (editor@example.com)
**Steps**:
1. Log in as editor
2. Use browser dev tools or Postman to send direct update request:
   ```js
   supabase.from('stories').update({ status: 'published' }).eq('id', 'story-id')
   ```

**Expected**:
- ✅ Request is rejected by RLS policy
- ✅ Error message returned
- ✅ Story status remains unchanged

#### Test 8.3: Multiple editors submit stories simultaneously
**User**: Multiple editors
**Steps**:
1. Have 3 editors create and submit stories at the same time
2. Admin reviews and publishes them

**Expected**:
- ✅ All stories maintain correct author attribution
- ✅ No race conditions or attribution conflicts
- ✅ Dashboard counts update correctly

---

## Verification Checklist

### Database Verification
- [ ] `profiles` table exists with correct schema
- [ ] `stories.author_id` references `profiles.id` (not `auth.users.id`)
- [ ] `stories.status` accepts: 'draft', 'in_review', 'published'
- [ ] Trigger auto-creates profile on user signup
- [ ] RLS policies are enabled and enforce workflow rules

### UI Verification
- [ ] User full_name displays in header/nav (fallback to email)
- [ ] Author byline shows on public story pages: "By [Author Name]"
- [ ] Author byline shows on story cards in feed
- [ ] NO "published by" or "approved by" text anywhere
- [ ] Dashboard stats show correct counts (including "In Review")
- [ ] "In Review" filter tab works correctly
- [ ] Content is immutable while in_review (for editors)
- [ ] Admins can publish stories (green checkmark button)
- [ ] Editors cannot publish stories (no button visible)

### Workflow Verification
- [ ] Editor creates draft → status = 'draft'
- [ ] Editor submits for review → status = 'in_review'
- [ ] Admin publishes → status = 'published', `published_at` set
- [ ] Admin can return to draft (unpublish)
- [ ] Editor cannot edit while in_review
- [ ] Author attribution never changes (immutable)

---

## Acceptance Criteria

### ✅ PASS: All tests must pass
- All RLS policies enforce server-side security
- Public author credit always stays with original editor
- No "published by" text anywhere in the app
- Stories flow correctly: draft → in_review → published
- Only admins can publish stories
- User profiles display correctly throughout the app

### ❌ FAIL: If any of the following occur
- Editor can publish their own stories
- Admin name appears as author on published stories
- "Published by" text is visible anywhere
- RLS policies can be bypassed
- Author attribution changes when admin edits/publishes
- Content is editable while in_review (for editors)

---

## Rollback Plan

If critical issues are found:
1. Revert migration: Drop profiles table and restore old author_id constraint
2. Revert frontend changes via git
3. Clear browser caches
4. Re-test existing functionality

---

## Post-Deployment Monitoring

After deployment, monitor:
- **RLS Policy Violations**: Check Supabase logs for policy errors
- **Story Creation Rate**: Ensure editors can create stories without errors
- **Publish Success Rate**: Verify admins can publish without issues
- **Author Attribution**: Spot-check 10-20 published stories for correct bylines
- **Dashboard Performance**: Ensure stats and filters load quickly

---

## Test Summary

| Category | Tests | Pass | Fail |
|----------|-------|------|------|
| User Profile Display | 2 | ☐ | ☐ |
| Story Creation | 2 | ☐ | ☐ |
| Editorial Workflow | 5 | ☐ | ☐ |
| Public Author Byline | 3 | ☐ | ☐ |
| RLS Enforcement | 4 | ☐ | ☐ |
| Content Immutability | 2 | ☐ | ☐ |
| Dashboard & Review Queue | 3 | ☐ | ☐ |
| Edge Cases | 3 | ☐ | ☐ |
| **TOTAL** | **24** | **☐** | **☐** |

---

**Tested By**: ___________________
**Date**: ___________________
**Environment**: ☐ Local ☐ Staging ☐ Production
**Result**: ☐ PASS ☐ FAIL (see notes)
**Notes**: ___________________

---

## Contact

For issues or questions about this test plan:
- GitHub Issues: https://github.com/plugforsuccess/quotesync/issues
- Developer: Claude Code Implementation
