-- Accessibility: allow more final-exam attempts (3 -> 8) so a nervous or
-- slower test-taker (e.g. elderly students) is not locked out. The cooldown
-- between attempts is intentionally left unchanged (15 minutes).
UPDATE dd_courses
SET retake_limit = 8
WHERE slug = 'georgia-6hr-defensive-driving';
