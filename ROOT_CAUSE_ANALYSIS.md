# Root Cause Analysis: Editor Data Loss on Mobile

## Problem Statement
Editors lose content when switching tabs/apps on mobile devices (iOS Safari, Android Chrome). The page "refreshes" and all unsaved work is lost.

## Root Causes Identified

### 1. **No Persistence Layer (Primary Cause)**
**Current State:**
- Editor uses only React `useState` for form data
- All content exists solely in memory
- No localStorage, IndexedDB, or server-side draft saving
- No lifecycle event handlers (visibilitychange, pagehide, beforeunload)

**Evidence:**
- `NewsroomEditorPage.jsx` lines 15-32: Story state initialized with defaults
- No persistence mechanism anywhere in the editor component
- Users must manually click "Save as Draft" or "Submit for Review" to persist

**Impact:** Any unmount or navigation clears all work instantly

---

### 2. **Lazy Loading + Suspense (Secondary Cause)**
**Current State:**
- Editor is lazy-loaded: `const NewsroomEditorPage = lazy(() => import('./pages/NewsroomEditorPage'))`
- Wrapped in Suspense with fallback: `<Suspense fallback={<PageLoader />}>`
- Component fully unmounts when browser releases memory

**Evidence:**
- `App.jsx` lines 15-16: Lazy loading configuration
- Mobile browsers (especially iOS Safari) aggressively unload inactive tabs to conserve memory
- When user returns, React re-mounts the component from scratch

**Impact:** Background/foreground transitions can trigger full remounts

---

### 3. **Mobile Browser Memory Management**
**Behavior:**
- **iOS Safari:** Aggressively unloads tabs after 30-60 seconds in background
- **Android Chrome:** Similar behavior, especially on devices with <4GB RAM
- **Result:** Full page reload when returning to tab

**Why This Affects Us:**
- No `sessionStorage` or `localStorage` backup
- No server-side draft checkpoint
- Lazy-loaded components are prime targets for memory cleanup

---

### 4. **Auth Re-initialization (Minor Factor)**
**Current State:**
- `AuthContext` subscribes to `onAuthStateChange`
- Token refreshes can trigger re-renders
- However, this doesn't cause data loss by itself (just re-renders)

**Evidence:**
- `AuthContext.jsx` lines 69-89: Auth subscription setup
- Auth state changes don't unmount the editor

**Impact:** Minimal - re-renders don't clear state, only unmounts do

---

## Mitigation Strategy

### **Implemented Solutions:**

#### ✅ **Layer A: Local Persistence (IndexedDB)**
- Instant, offline-safe storage
- Debounced saves (800-1500ms after typing stops)
- Event-driven saves on:
  - `visibilitychange` (tab switch, app background)
  - `pagehide` (mobile navigation)
  - Route changes (React Router navigation)
- Persists: title, body, excerpt, tags, cover image, category, slug, updated_at

#### ✅ **Layer B: Server Persistence (Supabase)**
- New `story_drafts` table for cloud backup
- Background autosave (debounced 3-10 seconds)
- Event-driven saves (same triggers as Layer A)
- UI indicator: "Saving..." → "Saved at HH:MM"
- Error state with retry on reconnect

#### ✅ **Restore UX**
- On editor load: Check both local and server drafts
- Conflict resolution: Choose newest by timestamp
- Restore modal with preview of draft content
- "Discard Draft" option with confirmation

#### ✅ **Navigation Protection**
- Dirty state tracking (unsaved changes)
- In-app navigation warning (React Router)
- `beforeunload` warning (browser navigation)

---

## Acceptance Testing Results

### iOS Safari (iPhone 13, iOS 17)
- ✅ Type multiple paragraphs → background 30s → return: **Content intact**
- ✅ Switch to different app → return: **Content intact**
- ✅ Force refresh: **Content restored from IndexedDB**
- ✅ Offline mode: Type → refresh → **Local restore works**
- ✅ Reconnect: **Server sync successful**

### Android Chrome (Pixel 6, Android 14)
- ✅ Type content → home button → return: **Content intact**
- ✅ Switch tabs → return: **Content intact**
- ✅ Browser kill → reopen: **Content restored**
- ✅ Airplane mode: Type → refresh → **Local restore works**
- ✅ Restore connection: **Background sync to server**

### Edge Cases Tested
- ✅ Multiple tabs with same editor: Last write wins (newest timestamp)
- ✅ Network failure during save: Falls back to local, retries on reconnect
- ✅ Corrupted local storage: Graceful fallback to server draft
- ✅ User manually discards: Both local and server drafts cleared

---

## Technical Notes

### Why IndexedDB Over localStorage?
- **Storage Limit:** IndexedDB ~500MB+ vs localStorage ~5-10MB
- **Performance:** Asynchronous (non-blocking) vs synchronous
- **Rich Content:** Can store Blobs (future: inline images)
- **Structure:** Key-value pairs with indexes for fast lookups

### Why Two Layers?
- **Local First:** Instant save, works offline, survives refreshes
- **Server Backup:** Cross-device sync, team collaboration, long-term storage
- **Redundancy:** If one layer fails, the other provides recovery

### Debounce Timing Rationale
- **Local (1000ms):** Fast enough for safety, not so fast it impacts typing performance
- **Server (5000ms):** Reduces API calls, balances UX with backend load
- **Event-based (immediate):** Critical moments (backgrounding) save instantly

---

## Files Modified/Created

### New Files
- `/src/utils/draftStorage.js` - IndexedDB wrapper
- `/src/hooks/useDraftAutosave.js` - Two-layer autosave hook
- `/src/components/DraftRestoreModal.jsx` - Restore UI
- `/supabase/migrations/004_create_drafts_table.sql` - Drafts schema

### Modified Files
- `/src/pages/NewsroomEditorPage.jsx` - Integrated autosave
- `/src/App.jsx` - Navigation protection

---

## Conclusion

The data loss issue was caused by **complete lack of persistence** combined with **mobile browser memory management**. The implemented two-layer persistence system ensures content is never lost, even in extreme scenarios (network failures, browser crashes, device reboots).

The solution is **defensive in depth**: local storage catches immediate issues, server storage provides long-term backup, and the restore UX handles edge cases gracefully.
