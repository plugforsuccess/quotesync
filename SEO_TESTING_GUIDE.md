# SEO Testing Guide - Newsroom Stories

**Purpose:** Verify OpenGraph and Twitter Card previews work correctly for `/news/{slug}`

---

## Testing Tools

### 1. Facebook Sharing Debugger
**URL:** https://developers.facebook.com/tools/debug/

**Steps:**
1. Publish a test story with all SEO fields filled
2. Navigate to the story page (e.g., `/news/test-story-georgia-insurance`)
3. Copy the full URL from your browser
4. Paste into Facebook Debugger
5. Click "Debug"

**Expected Output:**
```
✅ og:title: "Georgia Auto Insurance Rates Jump 12% in 2024"
✅ og:description: "New data shows Georgia drivers paying more..."
✅ og:image: https://example.com/og-image.jpg
✅ og:url: https://insuredbycam.com/news/test-story-georgia-insurance
✅ og:type: article
✅ article:published_time: 2026-01-07T15:23:45.000Z
```

**Screenshot Expected:**
![Facebook Preview](https://i.imgur.com/example1.png)
- Large image preview
- Bold title
- Description text
- "insuredbycam.com" domain

---

### 2. Twitter Card Validator
**URL:** https://cards-dev.twitter.com/validator

**Steps:**
1. Same test story as above
2. Paste URL into Twitter validator
3. Click "Preview card"

**Expected Output:**
```
✅ twitter:card: summary_large_image
✅ twitter:title: "Georgia Auto Insurance Rates Jump 12% in 2024"
✅ twitter:description: "New data shows Georgia drivers paying more..."
✅ twitter:image: https://example.com/og-image.jpg
```

**Screenshot Expected:**
![Twitter Preview](https://i.imgur.com/example2.png)
- Summary Card with Large Image format
- Image above title
- Description below title

---

### 3. LinkedIn Post Inspector
**URL:** https://www.linkedin.com/post-inspector/

**Steps:**
1. Paste story URL
2. Click "Inspect"

**Expected:** Same as Facebook (uses OpenGraph)

---

### 4. iMessage / WhatsApp Preview

**Test:**
1. Open Messages app (iOS/macOS)
2. Send story URL to yourself
3. Wait 2-3 seconds for preview to load

**Expected:**
- Rich preview with image
- Title and description
- "insuredbycam.com" attribution

---

## Meta Tag Implementation Verification

### View Page Source Test

**Steps:**
1. Open story page in browser
2. Right-click → "View Page Source" (NOT inspect element)
3. Search for `<meta property="og:`

**Expected HTML:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Georgia Auto Insurance Rates Jump 12% in 2024 | InsuredByCam Insurance Newsroom</title>

  <!-- Description -->
  <meta name="description" content="New data shows Georgia drivers paying more for auto insurance in 2024. Find out what's driving rates up and how to save." />

  <!-- OpenGraph Tags -->
  <meta property="og:title" content="Georgia Auto Insurance Rates Jump 12% in 2024" />
  <meta property="og:description" content="New data shows Georgia drivers paying more for auto insurance in 2024. Find out what's driving rates up and how to save." />
  <meta property="og:image" content="https://insuredbycam.com/images/georgia-insurance-rates-2024.jpg" />
  <meta property="og:url" content="https://insuredbycam.com/news/georgia-insurance-rates-2024" />
  <meta property="og:type" content="article" />
  <meta property="article:published_time" content="2026-01-07T15:23:45.000Z" />
  <meta property="article:author" content="InsuredByCam" />
  <meta property="article:section" content="data" />

  <!-- Twitter Card Tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Georgia Auto Insurance Rates Jump 12% in 2024" />
  <meta name="twitter:description" content="New data shows Georgia drivers paying more for auto insurance in 2024. Find out what's driving rates up and how to save." />
  <meta name="twitter:image" content="https://insuredbycam.com/images/georgia-insurance-rates-2024.jpg" />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://insuredbycam.com/news/georgia-insurance-rates-2024" />
</head>
<body>
  <!-- Story content here -->
</body>
</html>
```

---

## Implementation Code Reference

### Meta Tags Injection (StoryDetailPage.jsx)

```javascript
// src/pages/StoryDetailPage.jsx - Lines 16-88
const StoryMeta = ({ story }) => {
  useEffect(() => {
    if (!story) return;

    // Update page title
    document.title = story.meta_title || `${story.title} | InsuredByCam Insurance Newsroom`;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', story.meta_description || story.preview_hook);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = story.meta_description || story.preview_hook;
      document.head.appendChild(meta);
    }

    // OpenGraph tags
    const ogTags = {
      'og:title': story.meta_title || story.title,
      'og:description': story.meta_description || story.preview_hook,
      'og:image': story.og_image || story.video_thumbnail || '/og-default.jpg',
      'og:url': `${window.location.origin}/news/${story.slug}`,
      'og:type': 'article',
      'article:published_time': story.published_at,
      'article:author': 'InsuredByCam',
      'article:section': story.category
    };

    Object.entries(ogTags).forEach(([property, content]) => {
      if (!content) return;

      let meta = document.querySelector(`meta[property="${property}"]`);
      if (meta) {
        meta.setAttribute('content', content);
      } else {
        meta = document.createElement('meta');
        meta.setAttribute('property', property);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
      }
    });

    // Twitter Card tags
    const twitterTags = {
      'twitter:card': 'summary_large_image',
      'twitter:title': story.meta_title || story.title,
      'twitter:description': story.meta_description || story.preview_hook,
      'twitter:image': story.og_image || story.video_thumbnail || '/og-default.jpg'
    };

    Object.entries(twitterTags).forEach(([name, content]) => {
      if (!content) return;

      let meta = document.querySelector(`meta[name="${name}"]`);
      if (meta) {
        meta.setAttribute('content', content);
      } else {
        meta = document.createElement('meta');
        meta.setAttribute('name', name);
        meta.setAttribute('content', content);
        document.head.appendChild(meta);
      }
    });

    // Canonical URL
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      canonical.setAttribute('href', `${window.location.origin}/news/${story.slug}`);
    } else {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      canonical.setAttribute('href', `${window.location.origin}/news/${story.slug}`);
      document.head.appendChild(canonical);
    }
  }, [story]);

  return null;
};
```

---

## Limitation: Client-Side Meta Tags (SPA)

### The Problem

**Vite/React = Single Page Application (SPA)**
- Meta tags injected via JavaScript (client-side)
- Social media scrapers may not execute JavaScript
- May not see updated meta tags

### The Solution Options

#### Option 1: Pre-render Routes (Recommended for Production)

**Tool:** `@prerenderer/rollup-plugin`

```bash
npm install --save-dev @prerenderer/rollup-plugin
```

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { Prerenderer } from '@prerenderer/rollup-plugin';

export default defineConfig({
  plugins: [
    react(),
    Prerenderer({
      routes: ['/news/story-slug-1', '/news/story-slug-2'],  // List all story URLs
      staticDir: 'dist',
      renderer: '@prerenderer/renderer-puppeteer'
    })
  ]
});
```

**Benefits:**
- ✅ Meta tags in HTML source
- ✅ Works with all social scrapers
- ✅ Better SEO

**Drawback:**
- Need to rebuild on new story publish
- Consider dynamic pre-rendering with Netlify/Vercel

---

#### Option 2: Server-Side Rendering (SSR)

**Migrate to Vite SSR**

**Benefits:**
- ✅ Dynamic meta tags
- ✅ No rebuild needed
- ✅ Best SEO

**Drawback:**
- Major refactor (not worth it for this feature alone)

---

#### Option 3: Meta Tag Proxy Service

**Use a service like https://prerender.io**

**How it works:**
1. Detects social media bots (Facebook, Twitter crawlers)
2. Serves pre-rendered HTML with meta tags
3. Regular users get SPA

**Benefits:**
- ✅ No code changes
- ✅ Works immediately
- ✅ Handles all social platforms

**Cost:** $20-50/month

---

## Recommended Testing Flow

### Step 1: Local Testing (Without Pre-render)

1. **Add to `/public/` a test HTML file:**

```html
<!-- /public/test-og.html -->
<!DOCTYPE html>
<html>
<head>
  <meta property="og:title" content="Test Story Title" />
  <meta property="og:description" content="Test description for sharing." />
  <meta property="og:image" content="https://insuredbycam.com/og-test.jpg" />
  <meta property="og:url" content="https://insuredbycam.com/public/test-og.html" />
</head>
<body>
  <h1>Test Page</h1>
</body>
</html>
```

2. **Deploy to staging**
3. **Test with Facebook Debugger:**
   - URL: `https://your-staging-url.com/test-og.html`
   - Should show preview correctly

4. **If test works:** Meta tags are working (static HTML)
5. **Now test SPA route:**
   - URL: `https://your-staging-url.com/news/test-slug`
   - If preview fails → Need pre-rendering or SSR

---

### Step 2: Verify Current Implementation

**Even without pre-rendering, meta tags work for:**
- ✅ Google Search (executes JavaScript)
- ✅ Slack (executes JavaScript)
- ⚠️ Facebook (limited JavaScript support)
- ⚠️ Twitter (limited JavaScript support)
- ⚠️ iMessage/WhatsApp (no JavaScript)

**Workaround:** Use pre-rendering for production

---

## Quick Win: Default OG Image

**Add to `/public/og-default.jpg`:**
- Size: 1200x630px (Facebook recommended)
- Content: InsuredByCam logo + "Insurance Newsroom"
- Fallback when story has no custom image

**Update StoryMeta:**
```javascript
'og:image': story.og_image || story.video_thumbnail || `${window.location.origin}/og-default.jpg`
```

---

## Testing Checklist

### Before Production
- [ ] Create test story with all SEO fields
- [ ] Publish to staging environment
- [ ] Test Facebook Sharing Debugger
- [ ] Test Twitter Card Validator
- [ ] Test iMessage preview (if pre-rendered)
- [ ] Verify meta tags in page source
- [ ] Check canonical URL is correct
- [ ] Verify image loads (1200x630px)

### Production Monitoring
- [ ] Random spot-check stories weekly
- [ ] Monitor Facebook debugger errors
- [ ] Check Google Search Console for issues
- [ ] Verify images are loading from CDN

---

## Example Screenshot Locations

### Facebook Preview (Good)
```
┌─────────────────────────────────┐
│  [Large Image 1200x630]         │
│                                 │
│  Georgia Auto Insurance Rates   │
│  Jump 12% in 2024               │
│                                 │
│  New data shows Georgia drivers │
│  paying more for auto...        │
│                                 │
│  INSUREDBYCAM.COM               │
└─────────────────────────────────┘
```

### Twitter Preview (Good)
```
┌─────────────────────────────────┐
│  [Image 1200x630]               │
│                                 │
│  Georgia Auto Insurance Rates   │
│  Jump 12% in 2024               │
│                                 │
│  New data shows Georgia drivers │
│  paying more...                 │
│                                 │
│  insuredbycam.com               │
└─────────────────────────────────┘
```

---

## Conclusion

**Current Status:**
- ✅ Meta tags properly implemented in code
- ✅ Will work for Slack, Google
- ⚠️ May not work for Facebook/Twitter without pre-rendering

**Recommendation:**
1. Test in staging with Facebook Debugger
2. If fails → Add pre-rendering plugin
3. If passes → Ship as-is (some crawlers support client-side JS)

**Pre-rendering is NOT a blocker for MVP** but should be added within 2 weeks of launch for optimal social sharing.
