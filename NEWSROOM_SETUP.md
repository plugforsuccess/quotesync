# Newsroom Setup Guide

## Issue: Stories Not Loading

The newsroom requires database tables in Supabase. Follow these steps to set up:

## Step 1: Run Database Migration

1. Go to your Supabase project: https://ghnpzllykteelveezhnv.supabase.co
2. Navigate to **SQL Editor** in the left sidebar
3. Create a new query
4. Copy and paste the contents of `/migrations/002_create_newsroom_tables.sql`
5. Click **Run** to execute the migration

This creates:
- `stories` table (for news articles)
- `user_roles` table (for admin/editor permissions)
- `story_analytics` table (for tracking views/clicks)

## Step 2: Add Sample Stories

After running the migration, add some test stories:

```sql
-- Insert sample published story
INSERT INTO public.stories (
  title,
  slug,
  preview_hook,
  body,
  category,
  region,
  status,
  is_featured,
  published_at
) VALUES (
  'New Georgia Law Gives Homeowners More Time to Find Coverage',
  'georgia-homeowners-insurance-law-2026',
  'If you''re a Georgia homeowner, there''s important news that could save you from a coverage nightmare: Georgia Act 277 went into effect January 1st, 2026, doubling the notice period insurers must give you before canceling your homeowners policy.',
  E'If you''re a Georgia homeowner, there''s important news that could save you from a coverage nightmare: Georgia Act 277 went into effect January 1st, 2026, doubling the notice period insurers must give you before canceling your homeowners policy. This change is huge – here''s why.\n\n## What Changed?\n\nPreviously, insurers only had to give homeowners 30 days notice before canceling a policy. Now, under Act 277, that notice period has been extended to 60 days.\n\nThis gives homeowners twice as much time to:\n- Find replacement coverage\n- Address any issues causing the cancellation\n- Avoid lapses in coverage\n\n## Why This Matters\n\nA lapse in homeowners insurance can:\n- Put your mortgage at risk (most lenders require continuous coverage)\n- Leave you exposed to catastrophic financial loss\n- Make it harder and more expensive to get coverage in the future\n\n## What You Should Do\n\nIf you receive a cancellation notice:\n1. Don''t panic – you have 60 days\n2. Contact your insurer to understand why\n3. Start shopping for replacement coverage immediately\n4. Consider working with an independent agent who can compare multiple carriers\n\n## The Bigger Picture\n\nThis law was passed in response to the tightening insurance market in Georgia, where some insurers have been non-renewing policies or exiting the market entirely due to increased claims from severe weather.\n\nHaving more time to find coverage is a win for homeowners, but it''s also a reminder to regularly review your insurance situation – don''t wait for a cancellation notice to shop around.',
  'law',
  'Georgia',
  'published',
  true,
  NOW()
),
(
  'Atlanta Sees Record Insurance Claims Following Recent Storms',
  'atlanta-storm-insurance-claims-2026',
  'The recent severe weather that swept through metro Atlanta has resulted in record-breaking insurance claims, with early estimates suggesting over $500 million in damages across the region.',
  E'The recent severe weather that swept through metro Atlanta has resulted in record-breaking insurance claims, with early estimates suggesting over $500 million in damages across the region.\n\n## The Numbers\n\nInsurance commissioners report:\n- Over 25,000 homeowners claims filed\n- Average claim value: $20,000\n- Most common damages: roof damage, water intrusion, and fallen trees\n\n## What This Means for Premiums\n\nHistorically, major weather events like this can impact future insurance rates:\n- Affected areas may see premium increases of 10-25%\n- Some zip codes may face reduced coverage options\n- Carriers may tighten underwriting standards\n\n## How to Protect Yourself\n\n1. **Document Everything**: Take photos and videos of all damage\n2. **File Promptly**: Don''t delay filing your claim\n3. **Get Multiple Quotes**: Shop around for coverage before renewal\n4. **Consider Preventive Measures**: Installing storm shutters or reinforcing your roof can sometimes qualify for discounts\n\n## Looking Ahead\n\nExperts predict this won''t be the last major storm event. Georgia homeowners should:\n- Review their coverage limits annually\n- Ensure they have adequate dwelling coverage (not just the minimum required by lenders)\n- Consider separate flood insurance if in a flood-prone area\n\nThe insurance landscape in Georgia is changing, and staying informed is your best defense.',
  'accident',
  'Atlanta',
  'published',
  false,
  NOW() - INTERVAL '2 hours'
);
```

## Step 3: Restart Your Dev Server

The dev server is already running at: http://localhost:5173/

Navigate to the **Newsroom** tab and you should now see the sample stories!

## Troubleshooting

If stories still don't load:

1. **Check Browser Console**: Open DevTools (F12) and look for errors
2. **Verify .env file**: Ensure `/home/user/quotesync/.env` exists with valid Supabase credentials
3. **Check Supabase Dashboard**: Go to Table Editor and verify the `stories` table exists and has data
4. **Network Tab**: Check if API requests to Supabase are succeeding

## Next Steps

To add more stories or edit existing ones:
1. Visit: http://localhost:5173/admin-access-8by2X to login (requires admin role)
2. Create user roles in Supabase first (see migration file for schema)
