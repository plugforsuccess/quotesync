# Login Troubleshooting Guide

## Error: ERR_BLOCKED_BY_CLIENT

**Symptom:** Login button shows "Signing in..." but nothing happens, or you see `Failed to load resource: net::ERR_BLOCKED_BY_CLIENT` in browser console.

**Root Cause:** A browser extension (usually an ad blocker) is blocking network requests to Supabase.

---

## Quick Fix (Recommended)

### Option 1: Disable Ad Blocker for This Site

**For uBlock Origin:**
1. Click the uBlock Origin icon in your browser
2. Click the big power button to disable it for this site
3. Refresh the page
4. Try logging in again

**For AdBlock Plus:**
1. Click the AdBlock Plus icon
2. Select "Disable on this site"
3. Refresh the page
4. Try logging in again

**For Brave Browser:**
1. Click the shield icon in the address bar
2. Disable "Shields"
3. Refresh the page
4. Try logging in again

### Option 2: Whitelist Supabase Domain

Add these domains to your ad blocker's whitelist:
- `*.supabase.co`
- `*.supabase.io`

---

## Detailed Debugging Steps

### 1. Check Browser Console

Open browser DevTools (F12) and look for errors:

```
Failed to load resource: net::ERR_BLOCKED_BY_CLIENT
```

If you see this, it's definitely an ad blocker.

### 2. Check Network Tab

1. Open DevTools → Network tab
2. Try to log in
3. Look for requests to Supabase that are:
   - Red (blocked)
   - Showing status "blocked:other"

### 3. Identify Which Extension is Blocking

**Chrome/Edge:**
1. Open `chrome://extensions`
2. Disable extensions one by one
3. Try logging in after each disable
4. When login works, you've found the culprit

**Firefox:**
1. Open `about:addons`
2. Disable extensions one by one
3. Test login after each

Common blocking extensions:
- uBlock Origin
- AdBlock Plus
- Privacy Badger
- Ghostery
- Brave Shields
- DuckDuckGo Privacy Essentials

### 4. Test in Incognito/Private Mode

Incognito mode disables most extensions by default:

1. Open a new incognito/private window
2. Navigate to your site
3. Try logging in

If it works in incognito → It's definitely an extension

---

## Technical Details

### What's Being Blocked?

Ad blockers may block:
1. **Supabase Auth API** - `https://your-project.supabase.co/auth/v1/token`
2. **Supabase Database API** - `https://your-project.supabase.co/rest/v1/profiles`
3. **Performance monitoring** - If it looks like analytics/tracking

### Why Does This Happen?

- Supabase endpoints can match filter rules for analytics/tracking services
- The word "auth" or "token" in URLs can trigger blocks
- Database queries might look like data collection

### Browser Console Logs

With our updated code, you should see these logs:

**Successful login:**
```
[LoginPage] Attempting login...
[LoginPage] Login successful, waiting for auth state change...
[AuthProvider] Auth state changed: SIGNED_IN user@example.com
[AuthProvider] Profile loaded: user@example.com role: editor
[LoginPage] Auth event: SIGNED_IN user@example.com
[LoginPage] Navigating to dashboard
```

**Blocked by ad blocker:**
```
[LoginPage] Attempting login...
[LoginPage] Login failed: TypeError: Failed to fetch
```

**Network error:**
```
[LoginPage] Attempting login...
[LoginPage] Login failed: NetworkError...
```

---

## Environment Variables Check

Verify your Supabase credentials are set:

```bash
# Check .env or .env.local
cat .env.local | grep SUPABASE

# Should show:
# VITE_SUPABASE_URL=https://your-project.supabase.co
# VITE_SUPABASE_ANON_KEY=your-anon-key
```

Missing or incorrect credentials will also cause auth to fail.

---

## Vercel Deployment

If this happens on Vercel preview/production:

1. **Check Environment Variables:**
   - Go to Vercel project settings
   - Navigate to "Environment Variables"
   - Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set

2. **Check Redirect URLs in Supabase:**
   - Go to Supabase dashboard
   - Navigate to Authentication → URL Configuration
   - Add your Vercel domains:
     - `https://your-app.vercel.app`
     - `https://your-preview-*.vercel.app` (use wildcard)

3. **Check Vercel Logs:**
   ```bash
   vercel logs your-deployment-url
   ```

---

## Still Not Working?

### Check Supabase Status

1. Go to https://status.supabase.com
2. Check if there are any outages

### Test Supabase Connection

Run this in browser console:
```javascript
// Get Supabase client
const { data, error } = await supabase.auth.getSession();
console.log('Session:', data, 'Error:', error);
```

### Check Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to Authentication → Users
3. Verify the test user exists
4. Check if the user has the correct role in the `profiles` table

---

## Contact Support

If none of the above works, provide:

1. **Browser console logs** (full output)
2. **Network tab screenshot** (showing blocked requests)
3. **Browser and extensions list**
4. **Error message** from the login form

---

## Prevention for End Users

Add a banner on the login page:

```jsx
<div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
  <strong>Note:</strong> Please disable ad blockers or privacy extensions for this site to ensure login works properly.
</div>
```

This warns users before they encounter the issue.
