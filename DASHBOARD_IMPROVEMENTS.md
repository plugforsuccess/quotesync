# Dashboard Improvements - Complete Implementation

## Summary

All requested dashboard improvements have been implemented:
1. ✅ **Editor Name Column** - Shows author full name with email fallback
2. ✅ **Archive/Delete Functionality** - Soft delete with restore + hard delete (admin only)
3. ✅ **Preview Functionality** - Works for all statuses (draft, in_review, published)

---

## 1. Editor Name Column

### Implementation
- Added **"Editor"** column between "Story" and "Category"
- Fetches from `stories_with_authors` view which joins `stories` + `profiles`
- Shows `author_name` (full_name from profiles table)
- Fallback chain: `author_name` → `author_email` → `"Unknown"`
- Email shown as secondary text (small, gray) when full name exists

### Data Model
```sql
-- stories_with_authors view already exists
CREATE VIEW stories_with_authors AS
SELECT
  s.*,
  p.full_name AS author_name,
  p.email AS author_email
FROM stories s
LEFT JOIN profiles p ON s.author_id = p.id;
```

### Display Example
```
Editor Column:
John Doe
john@example.com  (small gray text)
```

### Acceptance Criteria Met
- ✅ Every story row shows an Editor value
- ✅ Full name is primary display
- ✅ Email shown as secondary (admin context)
- ✅ Fallback to "Unknown" if no profile data
- ✅ Public story page displays author name (via stories_with_authors view)

---

## 2. Archive & Delete Functionality

### Implementation

#### Archive (Soft Delete)
- **Button**: Orange Archive icon (box icon)
- **Confirmation**: "Archive this story? It will be removed from newsroom but can be restored later from the Archived tab."
- **Action**: Calls `archive_story(story_id, archived_by)` RPC function
- **Result**: Sets `status='archived'`, `archived_at=NOW()`, `archived_by=current_user`, saves `previous_status`
- **Visibility**: Archived stories hidden from "All Stories" view

#### Archived Tab
- **Filter Button**: "Archived (count)" in orange styling
- **Admin Only**: Only admins can see this tab
- **Stats**: Shows count of archived stories in stats cards
- **Actions**: Restore and Hard Delete buttons

#### Restore
- **Button**: Blue undo arrow icon
- **Confirmation**: "Restore this story? It will return to its previous status."
- **Action**: Calls `restore_story(story_id)` RPC function
- **Result**: Returns story to `previous_status` (draft, in_review, or published), clears archive fields
- **Permission**: Admin only

#### Hard Delete (Permanent)
- **Button**: Red trash icon
- **Confirmation**: Two-step confirmation:
  1. "PERMANENTLY DELETE? This action CANNOT be undone..."
  2. "Final confirmation: This is your last chance to cancel."
- **Action**: Direct `DELETE FROM stories WHERE id = ?`
- **Result**: Story permanently removed from database
- **Permission**: Admin only
- **Safety**: Requires double confirmation

### UI States
- **Loading**: Buttons disabled with opacity-50 during operations
- **Error**: Alert with specific error message
- **Success**: List refreshes to show updated state
- **No Optimistic UI**: Only updates after successful response

### Acceptance Criteria Met
- ✅ Archive reliably hides stories from active lists
- ✅ Archived tab shows all archived stories
- ✅ Restore returns story to previous status
- ✅ Hard delete works with double confirmation
- ✅ Only admin can archive, restore, and hard delete
- ✅ Proper error handling with user-friendly messages

---

## 3. Preview Functionality

### Implementation

#### Preview for Published Stories
- **Route**: `/news/:slug` (existing public route)
- **Button**: Eye icon with title "View Published Story"
- **Opens**: Public story page in new tab
- **Accessible**: Anyone (public)

#### Preview for Draft/In Review Stories
- **Route**: `/news/preview/:id` (new protected route)
- **Button**: Eye icon with title "Preview (Draft/In Review)"
- **Opens**: Preview page in new tab
- **Accessible**: Authenticated editors/admins only

### Preview Page Features
```
┌─────────────────────────────────────────────┐
│ PREVIEW MODE                    [Edit] [Close]│ ← Yellow banner
│ Status: draft                                  │
├─────────────────────────────────────────────┤
│                                               │
│  Story content rendered exactly as           │
│  it would appear on public page              │
│                                               │
│  - Title                                      │
│  - Author name                                │
│  - Category badge                             │
│  - Preview hook                               │
│  - Video embed (if any)                       │
│  - Story body (formatted)                     │
│  - Source attribution                         │
│  - Tags                                       │
│                                               │
└─────────────────────────────────────────────┘
```

### Preview Mode Banner
- **Sticky**: Stays at top when scrolling
- **Color**: Yellow background (#EAB308)
- **Content**:
  - "PREVIEW MODE" label with eye icon
  - Current status (draft/in_review)
  - "Edit Story" button → opens editor
  - "Close Preview" button → back to dashboard
- **No Indexing**: `<meta name="robots" content="noindex">` (prevents search engine indexing)

### Authentication Check
```javascript
// Preview page checks:
1. User is logged in
2. User has editor or admin role
3. Story exists and user can access it
4. Archived stories only shown to admins
```

### Error States
- **Not Logged In**: "You must be logged in as an editor or admin to preview stories"
- **Story Not Found**: Shows error with "Back to Dashboard" button
- **Archived (Non-Admin)**: "Only admins can preview archived stories"

### Acceptance Criteria Met
- ✅ Preview opens for draft/in_review stories
- ✅ Preview renders story content correctly
- ✅ Preview only accessible to authenticated users
- ✅ Published stories use public route
- ✅ Preview banner clearly indicates mode
- ✅ No indexing on preview pages
- ✅ Quick actions (Edit, Close) available

---

## 4. Additional Improvements

### Error Handling
- Specific error messages for each failure type:
  - Network errors: "Failed to load stories: [error]"
  - Archive failed: "Failed to archive story: [error]"
  - Restore failed: "Failed to restore story: [error]"
  - Delete failed: "Failed to delete story: [error]"

### Loading States
- **actionLoading** state tracks which story is being acted upon
- Buttons disabled with `disabled:opacity-50 disabled:cursor-not-allowed`
- Prevents duplicate actions on same story

### Stats Updates
- Added `archived` count to stats
- Total stories excludes archived (shows active count)
- Archived count badge on filter button

### Mobile Responsiveness
- Filters use `flex-wrap` for small screens
- Table uses horizontal scroll wrapper
- Buttons show/hide labels on mobile (icons only)

---

## Files Modified

### src/pages/NewsroomDashboardPage.jsx
**Changes:**
- Fetch from `stories_with_authors` view instead of `stories`
- Added `archived` to filter options
- Added `archived` count to stats
- Added `actionLoading` state for button management
- Added Editor column to table headers
- Display author_name in table rows
- Updated Preview button logic (different routes for published vs draft)
- Added Restore and Hard Delete functions
- Conditional actions for archived stories
- Improved error handling throughout

### src/App.jsx
**Changes:**
- Imported `StoryPreviewPage` component
- Added protected route for `/news/preview/:id`
- Route requires editor role for access

### src/pages/StoryPreviewPage.jsx (NEW)
**Features:**
- Authentication check (editor/admin only)
- Fetches story from `stories_with_authors` view
- Yellow preview mode banner with status
- Quick actions (Edit, Close Preview)
- Renders story content (same as public page)
- Error states for unauthorized/not found
- No indexing meta tag

---

## Testing Checklist

### Editor Column
- [x] Column appears between "Story" and "Category"
- [x] Shows full name when available
- [x] Shows email when full name missing
- [x] Shows "Unknown" when no profile data
- [x] Email appears as secondary text when name exists

### Archive Functionality
- [x] Archive button shows for active stories (admin only)
- [x] Confirmation dialog appears
- [x] Story disappears from "All Stories" after archive
- [x] Story appears in "Archived" tab
- [x] Restore button works
- [x] Hard Delete requires double confirmation
- [x] Hard Delete removes story permanently
- [x] Loading states work correctly
- [x] Error messages are clear

### Preview Functionality
- [x] Published stories open via `/news/:slug`
- [x] Draft stories open via `/news/preview/:id`
- [x] In review stories open via `/news/preview/:id`
- [x] Preview requires authentication
- [x] Non-authenticated users see error
- [x] Preview banner shows correct status
- [x] Edit button navigates to editor
- [x] Close button returns to dashboard
- [x] Story content renders correctly

### Edge Cases
- [x] Multiple editors don't conflict (one action at a time per story)
- [x] Network errors handled gracefully
- [x] Permission errors show clear messages
- [x] Missing data doesn't break UI (fallbacks work)
- [x] Archived stories only accessible to admins

---

## Migration Requirements

**IMPORTANT**: Before these features work in production, run these migrations:

```bash
# Apply in Supabase SQL Editor:
1. migrations/005_create_drafts_table.sql
2. migrations/006_add_archive_functionality.sql
3. migrations/007_hotfix_view_permissions.sql
```

**Verify migrations:**
```sql
-- Check stories_with_authors view exists
SELECT * FROM stories_with_authors LIMIT 1;

-- Check archive fields exist
\d stories;
-- Should show: archived_at, archived_by, previous_status

-- Check RPC functions exist
SELECT proname FROM pg_proc
WHERE proname IN ('archive_story', 'restore_story');
```

---

## Summary of Deliverables

✅ **Editor column** with full name + email fallback
✅ **Archive** soft delete with metadata tracking
✅ **Restore** from archive to previous status
✅ **Hard Delete** with admin-only + double confirmation
✅ **Archived tab** showing all archived stories
✅ **Preview** for all statuses with protected route
✅ **Preview banner** with quick actions
✅ **Error handling** with specific messages
✅ **Loading states** preventing duplicate actions
✅ **Stats updates** including archived count

All acceptance criteria have been met! 🎉
