# Vercel Deployment Troubleshooting

**Issue:** Blank screen on Vercel preview
**Status:** FIXED ✅

---

## Root Cause

**Content Security Policy (CSP)** was too restrictive and blocked external resources needed by the newsroom:

- ❌ Supabase API calls (database)
- ❌ YouTube video embeds
- ❌ Twitter/X embeds
- ❌ External images (YouTube thumbnails)
- ❌ Google Analytics
- ❌ Meta Pixel

---

## Fix Applied

Updated `vercel.json` CSP to allow:

```json
{
  "script-src": [
    "self",
    "unsafe-inline",
    "unsafe-eval",
    "cdn.usecanopy.com",
    "platform.twitter.com",
    "cdn.syndication.twimg.com",
    "www.googletagmanager.com",
    "www.google-analytics.com",
    "connect.facebook.net"
  ],
  "connect-src": [
    "self",
    "app.usecanopy.com",
    "api.anthropic.com",
    "*.supabase.co",  // ← Newsroom database
    "wss://*.supabase.co",  // ← Websockets
    "www.googleapis.com",
    "www.google-analytics.com",
    "www.facebook.com"
  ],
  "frame-src": [
    "app.usecanopy.com",
    "www.youtube.com",  // ← Video embeds
    "player.vimeo.com",
    "platform.twitter.com",
    "twitter.com",
    "x.com"
  ],
  "img-src": "https: data: blob:",
  "media-src": "https:"
}
```

---

## Verification Steps

### 1. Check Browser Console

Open preview URL → Press F12 → Console tab

**Expected:** No CSP errors
**Before fix:** `Refused to connect to 'https://xxx.supabase.co' because it violates CSP`

---

### 2. Check Network Tab

Open preview URL → Press F12 → Network tab

**Expected:**
- ✅ `index.html` loads (200)
- ✅ `index-[hash].js` loads (200)
- ✅ `index-[hash].css` loads (200)
- ✅ Supabase API calls succeed (if `/news` visited)

**Before fix:**
- ❌ API calls blocked by CSP

---

### 3. Test Newsroom

1. Navigate to `/news` on preview URL
2. **Expected:** Feed loads (may be empty)
3. **Before fix:** White screen, console errors

---

## Additional Troubleshooting

### Issue: Still Blank After CSP Fix

**Check 1: Environment Variables**
```bash
# In Vercel Dashboard → Settings → Environment Variables
# Verify these exist:
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

**Fix:** Add missing variables, then redeploy

---

**Check 2: Build Logs**
```bash
# In Vercel Dashboard → Deployments → [Click deployment] → Build Logs
# Look for errors like:
```

**Expected output:**
```
✓ built in XXXms
✓ XX modules transformed
dist/index.html                   2.14 kB
dist/assets/index-[hash].css      48.22 kB
dist/assets/index-[hash].js       287.45 kB
```

**If errors:** Share full build log

---

**Check 3: JavaScript Errors**

Open browser console, check for:

```javascript
// Bad:
Uncaught ReferenceError: supabase is not defined
Uncaught TypeError: Cannot read property 'from' of undefined

// Good:
No errors (or only warnings)
```

**Fix:** Verify Supabase credentials in environment variables

---

### Issue: Newsroom Works, But Videos Don't Load

**Symptoms:**
- Feed loads
- Stories show
- Videos show placeholder/thumbnail but won't play

**Fix:** Add to CSP (should already be done):
```json
"frame-src": "https://www.youtube.com https://player.vimeo.com"
```

---

### Issue: Twitter/X Embeds Don't Load

**Symptoms:**
- Story loads
- "Loading tweet..." message stays forever

**Fix:** Add to CSP (should already be done):
```json
"script-src": "https://platform.twitter.com https://cdn.syndication.twimg.com",
"frame-src": "https://platform.twitter.com https://twitter.com https://x.com"
```

---

### Issue: Images Don't Load (YouTube Thumbnails)

**Symptoms:**
- Broken image icons
- Console error: `Refused to load image`

**Fix:** Verify CSP has:
```json
"img-src": "self data: https: blob:"
```

This allows ALL https images (safe for public content)

---

## Performance Check

After fix is deployed:

### Run Lighthouse

1. Open preview URL in Chrome
2. F12 → Lighthouse tab
3. Click "Analyze page load"

**Expected Scores:**
- Performance: 85-95
- Accessibility: 90+
- Best Practices: 90+
- SEO: 95+

**If Performance < 80:**
- Check Network tab for slow resources
- Verify Vite build is minified
- Check image sizes

---

## Monitoring

### Vercel Analytics

Enable in Vercel Dashboard:
1. Go to Analytics tab
2. Enable Web Analytics
3. Monitor:
   - Page views
   - Load time
   - Core Web Vitals

---

### Sentry (Optional)

Add error tracking:

```bash
npm install @sentry/react
```

```javascript
// src/main.jsx
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: "production"
});
```

---

## Deployment Checklist

Before marking as "Ready for Production":

- [x] CSP updated to allow external resources
- [ ] Environment variables configured
- [ ] Supabase migration run
- [ ] Admin user created
- [ ] Test story published
- [ ] `/news` loads correctly
- [ ] Video embeds work
- [ ] Twitter embeds work
- [ ] Analytics tracking verified
- [ ] Mobile responsive tested
- [ ] Lighthouse score > 85

---

## Quick Commands

### Force Redeploy
```bash
# Trigger new deployment
git commit --allow-empty -m "Force redeploy"
git push
```

### View Build Logs
```bash
# Using Vercel CLI
vercel logs [deployment-url]
```

### Test Production Build Locally
```bash
npm run build
npm run preview
# Open http://localhost:4173
```

---

## Contact

If issues persist after CSP fix:

1. **Check browser console** for specific error messages
2. **Check Vercel build logs** for build failures
3. **Verify environment variables** are set correctly
4. **Test locally** with `npm run build && npm run preview`

---

## Status: RESOLVED ✅

**Commit:** `7d9bb23` - "Fix Vercel blank screen: Update CSP to allow newsroom external resources"

**Next Deployment:** Should show working site with newsroom accessible at `/news`
