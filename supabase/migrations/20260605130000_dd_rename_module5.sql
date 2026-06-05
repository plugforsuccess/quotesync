-- Rename Module 5 to "Sharing the Road" so it doesn't overlap with the new
-- Module 7 ("Georgia Traffic Laws"). Idempotent.
UPDATE dd_modules
SET title = 'Sharing the Road'
WHERE ordinal = 5
  AND course_id = (SELECT id FROM dd_courses WHERE slug = 'georgia-6hr-defensive-driving');
