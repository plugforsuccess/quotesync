-- ============================================================================
-- Defensive Driving — add Module 7 (Georgia Traffic Laws) to the final-exam pool
-- ----------------------------------------------------------------------------
-- Module 7 was added after the original seed (20260605120000_dd_module7_georgia_laws),
-- so it has a knowledge-check bank but NO questions in the randomized final-exam
-- pool (module_id = NULL). The final exam therefore could never test the GA-law
-- module that students are required to complete. This seeds 6 M7-tagged pool
-- questions — comparable to the per-module weighting of M4/M5 — so Georgia-law
-- content is represented in the drawn exam.
--
-- Idempotent: skips entirely if the M7 pool questions are already present.
-- Statutory figures mirror the M7 content and must be re-verified on the annual
-- legal review (see 20260604120100_dd_seed_ga_course.sql header).
-- ============================================================================

DO $$
DECLARE
  v_course UUID;
BEGIN
  SELECT id INTO v_course FROM dd_courses
   WHERE slug = 'georgia-6hr-defensive-driving';
  IF v_course IS NULL THEN
    RAISE NOTICE 'dd m7 exam pool: course not found, skipping.';
    RETURN;
  END IF;

  -- Sentinel guard: if any M7 pool question is already seeded, skip the batch.
  IF EXISTS (
    SELECT 1 FROM dd_questions
     WHERE course_id = v_course AND module_id IS NULL
       AND objective_tag = 'implied-consent'
  ) THEN
    RAISE NOTICE 'dd m7 exam pool: already seeded, skipping.';
    RETURN;
  END IF;

  -- ---- M7-tagged final-exam pool questions (module_id = NULL) ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'Under Georgia''s Hands-Free Act, which action is NOT allowed while driving?',
   '[{"key":"a","text":"Holding or physically supporting a phone with any part of your body"},{"key":"b","text":"Using a single touch to start or end a hands-free call"},{"key":"c","text":"Following voice directions from a dash-mounted GPS"},{"key":"d","text":"Talking through a Bluetooth earpiece"}]'::jsonb, 'a', 'hands-free'),
  (v_course, NULL, 'mc', 'Under Georgia''s implied-consent law, refusing the state-administered chemical test after a lawful DUI arrest results in:',
   '[{"key":"a","text":"No penalty as long as you later submit to a test"},{"key":"b","text":"An administrative license suspension separate from the DUI case"},{"key":"c","text":"Only a verbal warning"},{"key":"d","text":"Automatic dismissal of the DUI charge"}]'::jsonb, 'b', 'implied-consent'),
  (v_course, NULL, 'mc', 'In addition to criminal penalties, a Georgia DUI conviction generally carries:',
   '[{"key":"a","text":"Only a fine"},{"key":"b","text":"No effect on your license for a first offense"},{"key":"c","text":"License suspension and a required DUI / risk-reduction program"},{"key":"d","text":"An automatic five-year revocation for any first offense"}]'::jsonb, 'c', 'dui-law'),
  (v_course, NULL, 'mc', 'Failing to pay Georgia''s $200 Super Speeder state fee within the required period results in:',
   '[{"key":"a","text":"A warning letter only"},{"key":"b","text":"Suspension of the driver''s license"},{"key":"c","text":"Doubling of the local fine"},{"key":"d","text":"No further consequence"}]'::jsonb, 'b', 'super-speeder'),
  (v_course, NULL, 'mc', 'Georgia''s child-restraint law generally requires children under age 8 to be:',
   '[{"key":"a","text":"Seated in the front passenger seat"},{"key":"b","text":"Secured in an appropriate car seat or booster, unless taller than 4''9\""},{"key":"c","text":"Restrained by a lap belt only"},{"key":"d","text":"Held by an adult passenger"}]'::jsonb, 'b', 'child-restraint'),
  (v_course, NULL, 'mc', 'Under Georgia law, a driver involved in a crash causing injury, death, or significant property damage must:',
   '[{"key":"a","text":"Leave if no police officer is present"},{"key":"b","text":"Stop only if their own vehicle is damaged"},{"key":"c","text":"Stop, render reasonable aid, exchange information, and report as required"},{"key":"d","text":"Wait 24 hours and then file a report online"}]'::jsonb, 'c', 'crash-response');

  RAISE NOTICE 'dd m7 exam pool: 6 Georgia-law questions added to the final-exam pool (course %).', v_course;
END $$;
