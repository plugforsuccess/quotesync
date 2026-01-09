# Troubleshooting: Story Won't Save

## Issue
Admin user tried to save a story but the save button froze showing "Saving..." and the story didn't appear in the database.

## Potential Causes

### 1. **User Not in user_roles Table** (Most Likely)
The admin user might not have a role record in the `user_roles` table. The RLS policies require this.

**Fix: Add user to user_roles table**

```sql
-- First, check if the user exists in auth.users
SELECT id, email FROM auth.users;

-- Then check if they have a role
SELECT * FROM public.user_roles;

-- If the user is missing, add them as admin:
INSERT INTO public.user_roles (user_id, role)
VALUES ('USER_ID_FROM_AUTH_USERS', 'admin');

-- Replace USER_ID_FROM_AUTH_USERS with the actual UUID
```

### 2. **RLS Policy Blocking Insert**
The Row Level Security policy might be preventing the insert.

**Check:** Look at the migration file line 150-157. The policy requires:
- User must be authenticated
- User must have 'editor' or 'admin' role in user_roles table

**Debug in Supabase:**
```sql
-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'stories';

-- Test if current user can insert (run as the logged-in user)
SELECT EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
);
-- Should return TRUE
```

### 3. **Authentication Issue**
User might not be properly logged in.

**Fix:**
1. Go to `/admin-access-8by2X`
2. Log out and log back in
3. Check browser console for auth errors

### 4. **Network/Connection Timeout**
Supabase connection might be timing out.

**Check:** Open browser DevTools (F12) → Network tab → Try to save a story → Look for failed requests to Supabase

## Improved Error Logging

The code now includes:
- ✅ Detailed console logging (check browser console with F12)
- ✅ 15-second timeout protection
- ✅ Better error messages for common issues
- ✅ Authentication validation before save

## Steps to Debug

1. **Open Browser Console** (F12)
2. Try to save a story again
3. Look for console logs:
   - "Attempting to save story"
   - "Creating new story..."
   - "User authenticated: [USER_ID]"
   - "Inserting story with data: [DATA]"
   - Any error messages

4. **Check the exact error** in the console
5. **Look for one of these errors:**
   - `PGRST301` = Permission denied (RLS policy blocking)
   - `42501` = Database permission denied
   - `timeout` = Network issue
   - `auth` = User not logged in

## Quick Fix Checklist

- [ ] Verify user is in `auth.users` table
- [ ] Verify user has role in `public.user_roles` table
- [ ] Verify user role is 'admin' or 'editor'
- [ ] Check browser console for detailed error
- [ ] Try logging out and back in
- [ ] Check network connection to Supabase

## SQL Commands to Run in Supabase

```sql
-- 1. Get your user ID
SELECT id, email FROM auth.users WHERE email = 'YOUR_EMAIL@example.com';

-- 2. Check if you have a role
SELECT * FROM public.user_roles WHERE user_id = 'YOUR_USER_ID';

-- 3. If no role exists, create admin role:
INSERT INTO public.user_roles (user_id, role)
VALUES ('YOUR_USER_ID', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'admin';

-- 4. Verify RLS policies are enabled
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'stories';

-- 5. Test your permissions
SELECT
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('editor', 'admin')
  ) as can_create_stories;
-- Should return TRUE
```

## After Running Fixes

1. Refresh the editor page
2. Open browser console (F12)
3. Try creating a story again
4. Watch console for detailed logs
5. The new error messages will tell you exactly what's wrong

## Still Having Issues?

Check the browser console logs and share:
1. The full error message
2. Any console logs starting with "Error saving story:"
3. The network request to Supabase (in Network tab)
