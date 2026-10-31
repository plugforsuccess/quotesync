-- ============================================================================
-- Defensive Driving — add Module 8: Insurance, Claims & Your Record
-- ----------------------------------------------------------------------------
-- How a driving record affects premiums, Georgia's required liability limits,
-- the coverages that protect the driver (collision, comprehensive, UM, med pay),
-- and how to handle a claim after a crash. Content lives in
-- src/data/ddCourseContent.js under content_ref 'm8-insurance-claims'.
--
-- Seeds the module, its knowledge-check bank (module_id = module), and five
-- M8-tagged questions in the randomized final-exam pool (module_id = NULL), the
-- same shape as Module 7 (20260605120000 + 20260628120000).
--
-- The exam unlocks when every module is complete (counted live), so in-progress
-- students will see Module 8 added to their list. Completed enrollments are
-- unaffected. All inserts are idempotent.
-- Statutory figures (25/50/25, UM offer) must be re-verified on the annual
-- legal review (see 20260604120100_dd_seed_ga_course.sql header).
-- ============================================================================

INSERT INTO dd_modules (course_id, ordinal, title, content_ref, min_seconds)
SELECT id, 8, 'Insurance, Claims & Your Record', 'm8-insurance-claims', 60
FROM dd_courses
WHERE slug = 'georgia-6hr-defensive-driving'
  AND NOT EXISTS (
    SELECT 1 FROM dd_modules m WHERE m.course_id = dd_courses.id AND m.ordinal = 8
  );

-- Knowledge-check bank for Module 8.
INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, is_active)
SELECT m.course_id, m.id, 'mc', q.prompt, q.choices::jsonb, q.correct_key, true
FROM dd_modules m
JOIN dd_courses c ON c.id = m.course_id
CROSS JOIN (VALUES
  ('Which of these usually raises an auto-insurance premium the most?',
   '[{"key":"a","text":"Completing a defensive driving course"},{"key":"b","text":"An at-fault crash or a DUI on your record"},{"key":"c","text":"Three years with a clean record"},{"key":"d","text":"Paying your premium in full"}]','b'),
  ('What are Georgia''s minimum auto liability limits?',
   '[{"key":"a","text":"$10,000 / $20,000 / $10,000"},{"key":"b","text":"$15,000 / $30,000 / $5,000"},{"key":"c","text":"$25,000 / $50,000 / $25,000"},{"key":"d","text":"$100,000 / $300,000 / $100,000"}]','c'),
  ('Georgia is an at-fault state. That means after a crash:',
   '[{"key":"a","text":"Each driver''s insurer pays its own driver no matter who caused it"},{"key":"b","text":"The driver who caused the crash is responsible, and their liability coverage pays the others"},{"key":"c","text":"The state pays for all injuries"},{"key":"d","text":"No one is responsible for property damage"}]','b'),
  ('An uninsured driver hits you and you are injured. Which coverage on your policy helps pay for your injuries?',
   '[{"key":"a","text":"Comprehensive"},{"key":"b","text":"Rental reimbursement"},{"key":"c","text":"Uninsured / underinsured motorist (UM)"},{"key":"d","text":"Roadside assistance"}]','c'),
  ('Right after a minor crash, which of these should you avoid?',
   '[{"key":"a","text":"Taking photos of the vehicles and scene"},{"key":"b","text":"Getting the police report number"},{"key":"c","text":"Arguing about or admitting fault at the scene"},{"key":"d","text":"Notifying your insurer promptly"}]','c')
) AS q(prompt, choices, correct_key)
WHERE c.slug = 'georgia-6hr-defensive-driving' AND m.ordinal = 8
  AND NOT EXISTS (SELECT 1 FROM dd_questions dq WHERE dq.module_id = m.id);

-- M8-tagged questions in the final-exam pool.
DO $$
DECLARE
  v_course UUID;
BEGIN
  SELECT id INTO v_course FROM dd_courses WHERE slug = 'georgia-6hr-defensive-driving';
  IF v_course IS NULL THEN
    RAISE NOTICE 'dd m8 exam pool: course not found, skipping.';
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM dd_questions
     WHERE course_id = v_course AND module_id IS NULL AND objective_tag = 'insurance-minimums'
  ) THEN
    RAISE NOTICE 'dd m8 exam pool: already seeded, skipping.';
    RETURN;
  END IF;

  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'Georgia''s minimum liability coverage for bodily injury to one person is:',
   '[{"key":"a","text":"$10,000"},{"key":"b","text":"$25,000"},{"key":"c","text":"$50,000"},{"key":"d","text":"$100,000"}]'::jsonb, 'b', 'insurance-minimums'),
  (v_course, NULL, 'mc', 'If the damages from a crash you cause exceed your liability limits:',
   '[{"key":"a","text":"The other driver''s insurer must pay the rest"},{"key":"b","text":"The remaining amount is forgiven"},{"key":"c","text":"You can be held personally responsible for the difference"},{"key":"d","text":"The State of Georgia pays the difference"}]'::jsonb, 'c', 'insurance-limits'),
  (v_course, NULL, 'mc', 'Which coverage pays for damage to your car from hail, theft, or hitting a deer?',
   '[{"key":"a","text":"Liability"},{"key":"b","text":"Comprehensive"},{"key":"c","text":"Medical payments"},{"key":"d","text":"Uninsured motorist"}]'::jsonb, 'b', 'insurance-coverages'),
  (v_course, NULL, 'mc', 'In Georgia, to go without uninsured motorist (UM) coverage, a policyholder must:',
   '[{"key":"a","text":"Do nothing; it is never included"},{"key":"b","text":"Reject it in writing"},{"key":"c","text":"Get approval from DDS"},{"key":"d","text":"Carry only the state minimum"}]'::jsonb, 'b', 'insurance-um'),
  (v_course, NULL, 'mc', 'Which is the best first step for the insurance side of a crash, once everyone is safe?',
   '[{"key":"a","text":"Wait a few weeks to see if anyone files a claim"},{"key":"b","text":"Document the scene, exchange information, and notify your insurer promptly"},{"key":"c","text":"Agree to pay the other driver in cash"},{"key":"d","text":"Repair your car before reporting the crash"}]'::jsonb, 'b', 'insurance-claims');

  RAISE NOTICE 'dd m8 exam pool: 5 insurance questions added (course %).', v_course;
END $$;
