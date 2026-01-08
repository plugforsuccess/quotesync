# Insurance Newsroom Architecture

**Version:** 1.0
**Last Updated:** January 2026
**Tech Stack:** React + Vite + Supabase + TailwindCSS

---

## 🎯 Executive Summary

The Insurance Newsroom is a **story-first media intelligence layer** built into insuredbycam.com. It functions as:

- **Trust engine** - Build credibility through timely, relevant coverage
- **Attention engine** - Primary landing surface from Instagram/TikTok
- **Conversion engine** - Drive quote submissions via education-first approach

This is **not** a blog. It's a living newsroom that feels current, professional, and authoritative.

---

## 🏗️ System Architecture

### High-Level Flow

```
┌─────────────────┐
│   User Lands    │
│   on /news      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│  Infinite Feed  │◄─────│  Supabase    │
│  (NewsroomPage) │      │  Database    │
└────────┬────────┘      └──────────────┘
         │
         ├─────► Story Card (with lazy video)
         │
         ├─────► Modal or Full Page
         │
         └─────► CTAs → Quotes / Courses
```

### Tech Stack Details

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + Vite | SPA with fast HMR |
| **Routing** | React Router v7 | Client-side routing |
| **Styling** | TailwindCSS | Utility-first CSS |
| **Database** | Supabase (PostgreSQL) | Stories, analytics, auth |
| **Auth** | Supabase Auth | Role-based access (viewer/editor/admin) |
| **Analytics** | GA4 + Meta Pixel + Supabase | Multi-channel tracking |
| **Video** | YouTube / X / Vimeo embeds | Lazy-loaded, third-party |

---

## 📂 File Structure

```
src/
├── pages/
│   ├── NewsroomPage.jsx               # Public feed with infinite scroll
│   ├── StoryDetailPage.jsx            # Individual story (/news/{slug})
│   ├── NewsroomDashboardPage.jsx      # Admin/editor dashboard
│   └── NewsroomEditorPage.jsx         # Story creation/editing CMS
│
├── components/
│   └── newsroom/
│       ├── StoryCard.jsx              # Feed card with video embed
│       ├── StoryModal.jsx             # Read more modal
│       └── VideoEmbed.jsx             # Unified video player
│
├── lib/
│   ├── supabase.js                    # Supabase client + auth helpers
│   ├── newsroomAnalytics.js           # Newsroom-specific tracking
│   └── analytics.js                   # General GA4 + Meta tracking
│
└── App.jsx                             # Routing configuration

migrations/
└── 002_create_newsroom_tables.sql     # Database schema
```

---

## 🗄️ Database Schema

### Core Tables

#### `stories`
Main content table with full editorial workflow.

```sql
CREATE TABLE stories (
  id UUID PRIMARY KEY,

  -- Content
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  preview_hook TEXT NOT NULL,  -- 2-3 sentence preview
  body TEXT NOT NULL,           -- Full article

  -- Classification
  category TEXT CHECK (category IN ('litigation', 'law', 'accident', 'data', 'policy')),
  region TEXT,                  -- 'GA', 'ATL', ZIP codes
  tags TEXT[],

  -- Video
  video_type TEXT CHECK (video_type IN ('own_hosted', 'youtube_embed', 'x_embed', NULL)),
  video_url TEXT,
  video_thumbnail TEXT,

  -- Attribution
  source_name TEXT,
  source_url TEXT,

  -- Publishing
  status TEXT CHECK (status IN ('draft', 'review', 'published', 'unpublished')),
  is_featured BOOLEAN DEFAULT FALSE,
  author_id UUID REFERENCES auth.users(id),
  published_at TIMESTAMP,

  -- SEO
  meta_title TEXT,
  meta_description TEXT,
  og_image TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Key Indexes:**
- `idx_stories_status` - Filter by status
- `idx_stories_published_at` - Order by publish date
- `idx_stories_slug` - Fast slug lookups
- `idx_stories_category` - Category filtering

#### `story_analytics`
Event tracking for funnel optimization.

```sql
CREATE TABLE story_analytics (
  id UUID PRIMARY KEY,
  story_id UUID REFERENCES stories(id),

  event_type TEXT CHECK (event_type IN (
    'feed_view',
    'story_impression',
    'video_play',
    'video_complete',
    'read_more_open',
    'cta_click',
    'share_click'
  )),

  user_session_id TEXT,          -- Anonymous session
  referrer TEXT,
  cta_type TEXT,
  metadata JSONB,

  created_at TIMESTAMP DEFAULT NOW()
);
```

#### `user_roles`
Role-based access control.

```sql
CREATE TABLE user_roles (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) UNIQUE,
  role TEXT CHECK (role IN ('viewer', 'editor', 'admin')),
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔐 Row-Level Security (RLS)

Supabase RLS policies enforce permissions without backend code.

### Public Access
- ✅ Anyone can view `published` stories
- ✅ Anyone can insert analytics events

### Editor Access
- ✅ View all stories (including drafts)
- ✅ Create new stories
- ✅ Update own drafts/reviews

### Admin Access
- ✅ Full CRUD on all stories
- ✅ Publish/unpublish stories
- ✅ Manage user roles
- ✅ View analytics

---

## 🎬 Video Handling

### Supported Types

1. **YouTube Embed** (`youtube_embed`)
   - Extracts video ID from URL
   - Lazy loads iframe
   - Shows thumbnail until user clicks

2. **X/Twitter Embed** (`x_embed`)
   - Loads Twitter widget script on demand
   - Extracts tweet ID
   - Displays embedded tweet

3. **Hosted Video** (`own_hosted`)
   - Vimeo embeds (iframe)
   - Direct MP4/WebM files (HTML5 video)
   - Cloudflare Stream / Mux URLs

### Performance Optimizations

```javascript
// Only load video players for:
// 1. Active card (in viewport)
// 2. Next card (preload)

// Non-active cards show:
// - Thumbnail image
// - Play button overlay
// - Zero JavaScript execution
```

**Critical Rule:** Never re-upload third-party news footage. Always embed official sources with visible attribution.

---

## 📊 Analytics Implementation

### Events Tracked

| Event | Trigger | Purpose |
|-------|---------|---------|
| `feed_view` | User lands on /news | Measure traffic |
| `story_impression` | Card enters viewport (50%) | Measure engagement |
| `video_play` | Video starts playing | Video engagement |
| `video_complete` | Video finishes | Content quality |
| `read_more_open` | User clicks "Read more" | Deep engagement |
| `cta_click` | CTA button clicked | Conversion tracking |
| `share_click` | Share button clicked | Viral potential |

### Multi-Channel Tracking

```javascript
// Each event goes to:
1. Supabase (story_analytics table)
2. Google Analytics 4
3. Meta Pixel

// Example:
trackStoryImpression(story) → {
  supabase.insert({ story_id, event_type: 'story_impression' }),
  gtag('event', 'newsroom_story_impression'),
  fbq('track', 'ViewContent')
}
```

---

## 🔄 Editorial Workflow

### Story Lifecycle

```
┌──────────┐     ┌──────────┐     ┌───────────┐
│  Draft   │────▶│  Review  │────▶│ Published │
└──────────┘     └──────────┘     └───────────┘
     ▲                                   │
     │                                   ▼
     └───────────────────────────────────┘
              Unpublish (admin)
```

### Roles & Permissions

| Action | Viewer | Editor | Admin |
|--------|--------|--------|-------|
| View published stories | ✅ | ✅ | ✅ |
| View all stories | ❌ | ✅ | ✅ |
| Create story | ❌ | ✅ | ✅ |
| Edit own drafts | ❌ | ✅ | ✅ |
| Edit any story | ❌ | ❌ | ✅ |
| Publish/unpublish | ❌ | ❌ | ✅ |
| Feature stories | ❌ | ❌ | ✅ |
| Delete stories | ❌ | ❌ | ✅ |

---

## 🎨 UI/UX Design Principles

### Feed Design (TikTok-like)

1. **Continuous scroll** - No pagination, seamless loading
2. **Story-first** - Headline is primary visual anchor
3. **Video optional** - Stories work with or without video
4. **One video plays at a time** - Automatic pause others
5. **Muted by default** - User must opt-in to audio

### Story Card Hierarchy

```
┌─────────────────────────────────┐
│  [Featured Badge]               │
│                                 │
│  📰 HEADLINE (Large, Bold)      │
│                                 │
│  Preview hook text...           │
│  explaining what happened       │
│                                 │
│  [Video Embed - Optional]       │
│  [Source: WSB-TV Atlanta]       │
│                                 │
│  🏷️ Litigation • GA • 2h ago    │
│                                 │
│  Read more → | Share            │
│  Compare policy • Next webinar  │
└─────────────────────────────────┘
```

### Modal vs. Full Page

**Current Implementation:** Modal (preferred)
- Keeps user in feed context
- Faster perceived performance
- Better for mobile UX

**Alternative:** Navigate to `/news/{slug}`
- Better for SEO (separate URL)
- Shareable deep links
- Server-side rendering friendly

**Recommendation:** Hybrid approach
- Modal for in-feed clicks
- Full page for direct links / social shares

---

## 🚀 Performance Optimizations

### Critical Performance Rules

1. **Lazy Load Everything**
   ```javascript
   // Videos only instantiate when:
   - Card is active (in viewport)
   - OR next card (preload)

   // Benefits:
   - Reduces initial page weight
   - Faster time to interactive
   - Lower bandwidth usage
   ```

2. **Intersection Observer**
   ```javascript
   // Track visibility without scroll listeners
   - Story impressions
   - Active card detection
   - Infinite scroll trigger
   ```

3. **Thumbnail Fallbacks**
   ```javascript
   // Show static images until video loads
   YouTube: img.youtube.com/vi/{id}/maxresdefault.jpg
   Custom: video_thumbnail field
   ```

4. **Database Indexes**
   - All queries use indexed columns
   - Pagination uses `range()` instead of `limit/offset`
   - Featured stories sorted first

5. **Supabase Realtime (Future)**
   ```javascript
   // Subscribe to new stories
   supabase
     .channel('stories')
     .on('INSERT', payload => {
       // Show "New stories available" banner
     })
   ```

---

## 🔍 SEO Strategy

### On-Page SEO

Every story page includes:

```html
<!-- Page Title -->
<title>{meta_title || title} | InsuredByCam Insurance Newsroom</title>

<!-- Meta Description -->
<meta name="description" content="{meta_description || preview_hook}" />

<!-- OpenGraph -->
<meta property="og:title" content="{title}" />
<meta property="og:description" content="{preview_hook}" />
<meta property="og:image" content="{og_image || video_thumbnail}" />
<meta property="og:url" content="/news/{slug}" />
<meta property="og:type" content="article" />

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="{title}" />
<meta name="twitter:image" content="{og_image}" />

<!-- Canonical URL -->
<link rel="canonical" href="https://insuredbycam.com/news/{slug}" />
```

### Crawlability

- ✅ All story content rendered in HTML (not hidden behind JS)
- ✅ Semantic HTML structure
- ✅ Unique URLs per story
- ✅ No infinite scroll blocking content
- ✅ Sitemap generation (recommended)

### Content Strategy

- Stories update frequently → signals freshness to Google
- Local focus (Georgia) → improves local SEO
- Category taxonomy → improves topical authority
- Source attribution → builds trust signals

---

## 📱 Social Media Integration

### Instagram/TikTok → Newsroom Flow

```
User sees clip on IG/TikTok
    ↓
Clicks "link in bio"
    ↓
Lands on /news
    ↓
Scrolls feed (familiar TikTok UX)
    ↓
Clicks "Read more"
    ↓
CTAs: Compare Policy / Join Webinar
```

### Share Functionality

```javascript
// Native share on mobile
if (navigator.share) {
  navigator.share({
    title: story.title,
    text: story.preview_hook,
    url: `/news/${story.slug}`
  });
}

// Fallback: Copy to clipboard
else {
  navigator.clipboard.writeText(url);
}
```

### Preview Generation

All story pages have rich previews for:
- WhatsApp / iMessage (OpenGraph)
- Twitter / X (Twitter Cards)
- Instagram Stories (link stickers)
- LinkedIn (article previews)

---

## 🛠️ Setup Instructions

### 1. Environment Configuration

Create `.env` file:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
VITE_META_PIXEL_ID=your-pixel-id
```

### 2. Database Setup

Run migration:

```bash
# In Supabase dashboard or via CLI
psql -f migrations/002_create_newsroom_tables.sql
```

### 3. Create Admin User

```sql
-- In Supabase SQL editor
INSERT INTO user_roles (user_id, role)
VALUES ('your-user-id-here', 'admin');
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Run Development Server

```bash
npm run dev
```

---

## 🔧 Key Components Reference

### NewsroomPage.jsx
- **Purpose:** Main feed with infinite scroll
- **Features:** Category filtering, lazy loading, video control
- **Analytics:** Tracks feed_view on mount

### StoryDetailPage.jsx
- **Purpose:** Individual story page
- **Features:** Full SEO metadata, related stories, CTAs
- **Analytics:** Tracks read_more_open

### NewsroomEditorPage.jsx
- **Purpose:** CMS interface for creating/editing stories
- **Access:** Requires `editor` or `admin` role
- **Features:** Draft saving, slug generation, video config

### NewsroomDashboardPage.jsx
- **Purpose:** Admin dashboard for story management
- **Access:** Requires `editor` or `admin` role
- **Features:** Approval workflow, publishing, featuring

### VideoEmbed.jsx
- **Purpose:** Unified video player for all types
- **Features:** Lazy loading, thumbnail fallbacks, type detection
- **Performance:** Zero overhead until activated

### StoryCard.jsx
- **Purpose:** Feed card with analytics
- **Features:** Impression tracking, video play tracking, CTAs
- **UX:** Hover states, share functionality

---

## 📈 Funnel Optimization

### Conversion Path

```
Feed View (100%)
    ↓
Story Impression (70%)
    ↓
Video Play (30%)
    ↓
Read More (15%)
    ↓
CTA Click (5%)
    ↓
Quote Submission (2%)
```

### Optimization Levers

1. **Feed Level**
   - Test headline formulas
   - A/B test thumbnail styles
   - Optimize category mix

2. **Story Level**
   - Test preview hook length
   - Video vs. no video performance
   - CTA placement and copy

3. **Conversion Level**
   - Test CTA types (policy vs. webinar)
   - Button colors and urgency
   - "Why this matters" messaging

---

## 🚫 Non-Goals

What this system deliberately **does not do:**

- ❌ Public commenting (not a discussion forum)
- ❌ User-generated content (curated only)
- ❌ Social features (likes, follows, etc.)
- ❌ Autoplay audio (respect user intent)
- ❌ Sensational design (maintain trust)

---

## 🔮 Future Enhancements

### Phase 2 Features

1. **Email Digest**
   - Weekly newsletter with top stories
   - Supabase Edge Function + Resend API

2. **Advanced Analytics Dashboard**
   - Story performance metrics
   - Conversion attribution
   - Heatmaps and scroll depth

3. **Content Scheduling**
   - Schedule publish time
   - Automatic unpublish after X days

4. **Rich Text Editor**
   - WYSIWYG markdown editor
   - Image uploads (Supabase Storage)
   - Embedded tweet/quote blocks

5. **Related Story Algorithm**
   - ML-based recommendations
   - User behavior signals
   - Category + region weighting

6. **Push Notifications**
   - Breaking news alerts
   - Web Push API integration

---

## 📞 Support & Maintenance

### Monitoring

- Check Supabase dashboard for errors
- Monitor RLS policy effectiveness
- Review analytics weekly

### Common Issues

**Issue:** Stories not loading
- Check Supabase URL/key in `.env`
- Verify RLS policies are enabled
- Check browser console for errors

**Issue:** Videos not playing
- Verify video URLs are accessible
- Check video_type matches URL format
- Test on incognito (ad blockers)

**Issue:** Infinite scroll stops
- Check `hasMore` state logic
- Verify STORIES_PER_PAGE constant
- Test with more than 10 stories

---

## 📄 License & Attribution

This newsroom system is proprietary to InsuredByCam.

**Third-Party Services:**
- Supabase (Database, Auth, Storage)
- YouTube (Video embeds)
- Twitter/X (Tweet embeds)
- Google Analytics (Analytics)
- Meta Pixel (Analytics)

**Attribution Requirements:**
- All embedded news footage must display source name
- Link to original article when available
- Never claim third-party content as original

---

## 🎓 Learning Resources

### Supabase
- [Supabase Docs](https://supabase.com/docs)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

### React Patterns
- [React Router](https://reactrouter.com/)
- [Intersection Observer API](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)

### Video Embeds
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
- [Twitter Embedded Tweets](https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets)

---

**End of Documentation**
