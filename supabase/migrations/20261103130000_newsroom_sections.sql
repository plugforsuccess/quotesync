-- Newsroom: three reader-facing sections (Help, Real stories, Georgia news).
-- The nine older categories stay valid for existing rows but are inactive.
ALTER TABLE public.stories DROP CONSTRAINT IF EXISTS stories_category_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_category_check CHECK (category = ANY (ARRAY[
  'help','real-stories','georgia-news',
  'policy-regulation','litigation-legal','accidents-claims','insurance-markets','data-research',
  'consumer-guidance','industry-carriers','weather-catastrophe','technology-ai']));

INSERT INTO public.story_category_definitions (slug, label, description, sort_order, is_active) VALUES
  ('help', 'Help', 'A question people bring to the desk, answered in plain language, with one thing to do at the end', 1, true),
  ('real-stories', 'Real stories', 'What happened on the desk: the situation, what we found, what we did, what it cost or saved', 2, true),
  ('georgia-news', 'Georgia news', 'A change in Georgia law, rates or carriers, and what it means for your policy', 3, true)
ON CONFLICT (slug) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, sort_order = EXCLUDED.sort_order, is_active = true;
UPDATE public.story_category_definitions SET is_active = false, sort_order = sort_order + 10
  WHERE slug NOT IN ('help','real-stories','georgia-news');

-- Existing stories: the first-person non-renewal piece is Help; the rest are Georgia news.
UPDATE public.stories SET category = 'help' WHERE slug = 'new-georgia-law-gives-homeowners-more-time-to-find-coverage-here-s-what-you-need-to-know';
UPDATE public.stories SET category = 'georgia-news' WHERE status = 'published' AND category <> 'help';

-- Two og_image values were web pages, not images: blank social previews.
UPDATE public.stories SET og_image = NULL WHERE og_image IS NOT NULL AND og_image !~* '\.(png|jpe?g|webp|gif)(\?|$)';

-- The feed reads this view; it was missing secondary_tags, so tags never showed.
CREATE OR REPLACE VIEW public.stories_with_authors AS
 SELECT s.id, s.title, s.slug, s.preview_hook, s.body, s.category, s.region, s.tags,
    s.video_type, s.video_url, s.video_thumbnail, s.source_name, s.source_url, s.status,
    s.is_featured, s.is_pinned, s.author_id, s.published_at, s.created_at, s.updated_at,
    s.meta_title, s.meta_description, s.og_image, s.archived_at, s.archived_by, s.previous_status,
    p.full_name AS author_name, p.email AS author_email,
    s.secondary_tags
   FROM public.stories s
     LEFT JOIN public.profiles p ON s.author_id = p.id;

NOTIFY pgrst, 'reload schema';
