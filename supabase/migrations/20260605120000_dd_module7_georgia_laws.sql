-- ============================================================================
-- Defensive Driving — add Module 7: Georgia Traffic Laws
-- ----------------------------------------------------------------------------
-- A consolidated review module that gathers Georgia's key driving laws (points,
-- Hands-Free Act, DUI/implied consent, Super Speeder, Move Over / school bus /
-- restraints, and crash duties) into one place. Content lives in
-- src/data/ddCourseContent.js under content_ref 'm7-georgia-laws'.
--
-- NOTE: module and questions are inserted in two statements on purpose — a
-- data-modifying CTE's new row is not visible to a sibling CTE's SELECT.
-- Both inserts are idempotent.
-- ============================================================================

INSERT INTO dd_modules (course_id, ordinal, title, content_ref, min_seconds)
SELECT id, 7, 'Georgia Traffic Laws', 'm7-georgia-laws', 3600
FROM dd_courses
WHERE slug = 'georgia-6hr-defensive-driving'
  AND NOT EXISTS (
    SELECT 1 FROM dd_modules m WHERE m.course_id = dd_courses.id AND m.ordinal = 7
  );

INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, is_active)
SELECT m.course_id, m.id, 'mc', q.prompt, q.choices::jsonb, q.correct_key, true
FROM dd_modules m
JOIN dd_courses c ON c.id = m.course_id
CROSS JOIN (VALUES
  ('In Georgia, how many points within a 24-month period result in a license suspension?',
   '[{"key":"a","text":"10 points"},{"key":"b","text":"12 points"},{"key":"c","text":"15 points"},{"key":"d","text":"20 points"}]','c'),
  ('Under Georgia''s Hands-Free Act, holding your phone to send a text while stopped at a red light is:',
   '[{"key":"a","text":"Legal because the vehicle is stopped"},{"key":"b","text":"Illegal because you are still operating in traffic"},{"key":"c","text":"Legal if you finish quickly"},{"key":"d","text":"Legal after dark"}]','b'),
  ('What is Georgia''s per se blood-alcohol limit for a driver under 21?',
   '[{"key":"a","text":"0.08%"},{"key":"b","text":"0.05%"},{"key":"c","text":"0.04%"},{"key":"d","text":"0.02%"}]','d'),
  ('Georgia''s Super Speeder law adds a $200 state fee for driving:',
   '[{"key":"a","text":"One mph over the limit"},{"key":"b","text":"85+ mph anywhere, or 75+ mph on a two-lane road"},{"key":"c","text":"Only in school zones"},{"key":"d","text":"Only over 100 mph"}]','b'),
  ('Georgia''s Move Over law requires drivers to:',
   '[{"key":"a","text":"Speed up past stopped responders"},{"key":"b","text":"Move over one lane, or slow down if unable, for stationary responders with flashing lights"},{"key":"c","text":"Stop in their lane"},{"key":"d","text":"Ignore utility vehicles"}]','b')
) AS q(prompt, choices, correct_key)
WHERE c.slug = 'georgia-6hr-defensive-driving' AND m.ordinal = 7
  AND NOT EXISTS (SELECT 1 FROM dd_questions dq WHERE dq.module_id = m.id);
