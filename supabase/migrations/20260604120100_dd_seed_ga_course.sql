-- ============================================================================
-- Defensive Driving — seed: "Georgia 6-Hour Defensive Driving" course
-- ----------------------------------------------------------------------------
-- Seeds one course, 6 modules (60-min floors = 21,600s total), per-module
-- knowledge-check banks, and a final-exam pool tagged to objectives per §4.1.
-- Idempotent: skips entirely if the course slug already exists.
--
-- Content is grounded in the supplied GA curriculum. Statutory figures
-- (point values, BAC, Super Speeder fee, Move Over, etc.) must be re-verified
-- on the annual legal review before any DDS submission. `is_dds_approved`
-- stays false until DDS approval is obtained (§3).
-- ============================================================================

DO $$
DECLARE
  v_course UUID;
  m1 UUID; m2 UUID; m3 UUID; m4 UUID; m5 UUID; m6 UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM dd_courses WHERE slug = 'georgia-6hr-defensive-driving') THEN
    RAISE NOTICE 'dd seed: course already present, skipping.';
    RETURN;
  END IF;

  INSERT INTO dd_courses (slug, title, version, jurisdiction, price_cents, currency,
                          min_seat_seconds, pass_threshold_pct, retake_limit,
                          retake_cooldown_seconds, exam_question_count,
                          is_active, is_dds_approved, compliance_label)
  VALUES (
    'georgia-6hr-defensive-driving',
    'Georgia 6-Hour Defensive Driving',
    '1.0', 'GA', 2495, 'usd',
    21600, 80, 3, 900, 25,
    true, false,
    'Certificate of Completion — Defensive Driving. Insurance premium discounts are determined by your insurer; this course is not represented as DDS-certified.'
  )
  RETURNING id INTO v_course;

  -- ---- Modules (60-min floors each = 21,600s total) ----
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 1, 'Foundations of Defensive Driving', 3600, 'm1-foundations')
    RETURNING id INTO m1;
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 2, 'The Driver — Human Factors', 3600, 'm2-human-factors')
    RETURNING id INTO m2;
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 3, 'Impairment — Alcohol & Drugs', 3600, 'm3-impairment')
    RETURNING id INTO m3;
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 4, 'Space, Speed & Vehicle Control', 3600, 'm4-space-speed')
    RETURNING id INTO m4;
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 5, 'Sharing the Road & Georgia Traffic Law', 3600, 'm5-sharing-road')
    RETURNING id INTO m5;
  INSERT INTO dd_modules (course_id, ordinal, title, min_seconds, content_ref)
    VALUES (v_course, 6, 'Conditions, Emergencies & Crash Response', 3600, 'm6-emergencies')
    RETURNING id INTO m6;

  -- ======================= MODULE KNOWLEDGE CHECKS =======================

  -- ---- Module 1: Foundations ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m1, 'mc', 'In the SIPDE / collision-prevention process, what is the FIRST step?',
   '[{"key":"a","text":"Execute the maneuver"},{"key":"b","text":"Search the road ahead"},{"key":"c","text":"Decide an action"},{"key":"d","text":"Predict the conflict"}]'::jsonb, 'b', 'prevention-model'),
  (v_course, m1, 'mc', 'A Georgia driver''s license is suspended upon accumulating how many points within 24 months?',
   '[{"key":"a","text":"10 points"},{"key":"b","text":"12 points"},{"key":"c","text":"15 points"},{"key":"d","text":"20 points"}]'::jsonb, 'c', 'ga-points'),
  (v_course, m1, 'mc', 'Completing a defensive driving course can remove up to how many points, and how often?',
   '[{"key":"a","text":"Up to 7 points, once every 5 years"},{"key":"b","text":"Up to 5 points, once a year"},{"key":"c","text":"All points, anytime"},{"key":"d","text":"Up to 3 points, once every 2 years"}]'::jsonb, 'a', 'ga-points'),
  (v_course, m1, 'mc', 'To qualify for the statutory insurance premium reduction, a driver generally must be at least what age?',
   '[{"key":"a","text":"18"},{"key":"b","text":"21"},{"key":"c","text":"25"},{"key":"d","text":"30"}]'::jsonb, 'c', 'discount-eligibility'),
  (v_course, m1, 'tf', 'Defensive driving treats operating a vehicle as a privilege governed by law, not an absolute right.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'attitude');

  -- ---- Module 2: Human Factors ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m2, 'mc', 'Texting while driving is especially dangerous because it involves which distraction types?',
   '[{"key":"a","text":"Only visual"},{"key":"b","text":"Only manual"},{"key":"c","text":"Visual, manual, and cognitive"},{"key":"d","text":"Only cognitive"}]'::jsonb, 'c', 'distraction'),
  (v_course, m2, 'tf', 'Under Georgia''s Hands-Free Act, a driver may not hold or support a phone with any part of the body while operating a vehicle.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'hands-free'),
  (v_course, m2, 'mc', 'Which is the only reliable countermeasure for drowsy driving?',
   '[{"key":"a","text":"Turning up the radio"},{"key":"b","text":"Opening a window"},{"key":"c","text":"Caffeine alone"},{"key":"d","text":"Getting adequate sleep / stopping to rest"}]'::jsonb, 'd', 'fatigue'),
  (v_course, m2, 'mc', 'Approximately what share of driving decisions depends on vision?',
   '[{"key":"a","text":"About 50%"},{"key":"b","text":"About 70%"},{"key":"c","text":"About 90%"},{"key":"d","text":"About 30%"}]'::jsonb, 'c', 'vision'),
  (v_course, m2, 'mc', 'The best response to an aggressive or road-raging driver is to:',
   '[{"key":"a","text":"Make eye contact to assert yourself"},{"key":"b","text":"Create space and avoid engaging"},{"key":"c","text":"Brake-check them"},{"key":"d","text":"Match their speed"}]'::jsonb, 'b', 'aggression');

  -- ---- Module 3: Impairment ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m3, 'mc', 'Georgia''s per se BAC limit for a non-commercial driver age 21 or older is:',
   '[{"key":"a","text":"0.02%"},{"key":"b","text":"0.04%"},{"key":"c","text":"0.08%"},{"key":"d","text":"0.10%"}]'::jsonb, 'c', 'dui-law'),
  (v_course, m3, 'mc', 'Georgia''s per se BAC limit for a driver under 21 is:',
   '[{"key":"a","text":"0.08%"},{"key":"b","text":"0.05%"},{"key":"c","text":"0.02%"},{"key":"d","text":"0.00%"}]'::jsonb, 'c', 'dui-law'),
  (v_course, m3, 'mc', 'The per se BAC limit for a commercial driver in Georgia is:',
   '[{"key":"a","text":"0.04%"},{"key":"b","text":"0.08%"},{"key":"c","text":"0.02%"},{"key":"d","text":"0.06%"}]'::jsonb, 'a', 'dui-law'),
  (v_course, m3, 'tf', 'Under Georgia''s implied-consent law, refusing chemical testing carries its own license suspension.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'implied-consent'),
  (v_course, m3, 'tf', 'Prescription and over-the-counter medications can impair driving and fall under Georgia''s DUI law.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'drugs'),
  (v_course, m3, 'mc', 'Which is a sound impaired-driving prevention strategy?',
   '[{"key":"a","text":"Drink coffee before driving"},{"key":"b","text":"Designate a sober driver or use a rideshare"},{"key":"c","text":"Wait 15 minutes then drive"},{"key":"d","text":"Drive slowly to compensate"}]'::jsonb, 'b', 'prevention');

  -- ---- Module 4: Space, Speed & Vehicle Control ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m4, 'mc', 'The recommended minimum following distance under ideal conditions is:',
   '[{"key":"a","text":"1 second"},{"key":"b","text":"2 seconds"},{"key":"c","text":"3 seconds"},{"key":"d","text":"6 seconds"}]'::jsonb, 'c', 'following-distance'),
  (v_course, m4, 'mc', 'In rain, fog, heavy traffic, or at night, you should increase your following distance to:',
   '[{"key":"a","text":"4 or more seconds"},{"key":"b","text":"Still 3 seconds"},{"key":"c","text":"2 seconds"},{"key":"d","text":"1 second"}]'::jsonb, 'a', 'following-distance'),
  (v_course, m4, 'mc', 'Total stopping distance is the sum of:',
   '[{"key":"a","text":"Reaction distance + braking distance only"},{"key":"b","text":"Perception distance + reaction distance + braking distance"},{"key":"c","text":"Speed + weight"},{"key":"d","text":"Braking distance + tire pressure"}]'::jsonb, 'b', 'stopping-distance'),
  (v_course, m4, 'mc', 'The Super Speeder fee applies to driving at least how fast on a two-lane road?',
   '[{"key":"a","text":"70 mph"},{"key":"b","text":"75 mph"},{"key":"c","text":"80 mph"},{"key":"d","text":"85 mph"}]'::jsonb, 'b', 'super-speeder'),
  (v_course, m4, 'tf', 'Braking distance increases roughly with the square of speed — doubling speed roughly quadruples braking distance.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'stopping-distance');

  -- ---- Module 5: Sharing the Road & Georgia Traffic Law ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m5, 'mc', 'Under Georgia''s Move Over law, when approaching a stopped emergency vehicle with flashing lights you must:',
   '[{"key":"a","text":"Speed past quickly"},{"key":"b","text":"Move over a lane if safe, or slow down if you cannot"},{"key":"c","text":"Stop in your lane"},{"key":"d","text":"Honk to alert them"}]'::jsonb, 'b', 'move-over'),
  (v_course, m5, 'mc', 'At a four-way stop where two vehicles arrive at the same time, who has the right-of-way?',
   '[{"key":"a","text":"The larger vehicle"},{"key":"b","text":"The vehicle on the left"},{"key":"c","text":"The vehicle on the right"},{"key":"d","text":"Whoever accelerates first"}]'::jsonb, 'c', 'right-of-way'),
  (v_course, m5, 'mc', 'A seat belt is worn correctly when the:',
   '[{"key":"a","text":"Lap belt sits low across the hips and the shoulder belt crosses the chest"},{"key":"b","text":"Shoulder belt is tucked behind the back"},{"key":"c","text":"Lap belt rests across the stomach"},{"key":"d","text":"Belt is left loose for comfort"}]'::jsonb, 'a', 'occupant-protection'),
  (v_course, m5, 'tf', 'Right-of-way is something a driver should give, not take.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'right-of-way'),
  (v_course, m5, 'tf', 'Children under age 13 are safest riding in the back seat.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'child-restraint');

  -- ---- Module 6: Conditions, Emergencies & Crash Response ----
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, m6, 'mc', 'If your vehicle begins to hydroplane, you should:',
   '[{"key":"a","text":"Brake hard"},{"key":"b","text":"Accelerate"},{"key":"c","text":"Ease off the accelerator and steer straight"},{"key":"d","text":"Turn sharply"}]'::jsonb, 'c', 'adverse-conditions'),
  (v_course, m6, 'mc', 'During a tire blowout you should:',
   '[{"key":"a","text":"Slam on the brakes immediately"},{"key":"b","text":"Grip the wheel firmly, ease off the gas, and slow gradually"},{"key":"c","text":"Steer sharply to the shoulder"},{"key":"d","text":"Accelerate to regain control"}]'::jsonb, 'b', 'emergency-maneuvers'),
  (v_course, m6, 'mc', 'To recover from a skid you should:',
   '[{"key":"a","text":"Brake hard and hold the wheel still"},{"key":"b","text":"Ease off the accelerator and steer where you want to go"},{"key":"c","text":"Pump the gas"},{"key":"d","text":"Close your eyes and brace"}]'::jsonb, 'b', 'emergency-maneuvers'),
  (v_course, m6, 'mc', 'In fog you should use which headlights?',
   '[{"key":"a","text":"High beams"},{"key":"b","text":"Low beams"},{"key":"c","text":"Hazard lights only"},{"key":"d","text":"No lights"}]'::jsonb, 'b', 'adverse-conditions'),
  (v_course, m6, 'tf', 'In Georgia, a driver involved in a crash involving injury has a duty to stop; leaving the scene is a serious offense.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'crash-response');

  -- ============================ FINAL EXAM POOL ============================
  -- module_id = NULL → drawn from for the randomized final exam.
  -- Proportions per §4.1: M1~15%, M2~15%, M3~15%, M4~20%, M5~20%, M6~15%.

  -- M1-tagged (Foundations)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'You are approaching a blind curve. Applying the prevention model, your best move is to:',
   '[{"key":"a","text":"Maintain speed and stay centered"},{"key":"b","text":"Reduce speed early, scan for hazards, and keep an escape path"},{"key":"c","text":"Accelerate through the curve"},{"key":"d","text":"Move to the left edge line"}]'::jsonb, 'b', 'prevention-model'),
  (v_course, NULL, 'mc', 'Which sequence correctly orders the prevention model?',
   '[{"key":"a","text":"Decide, Search, Identify, Predict, Execute"},{"key":"b","text":"Search, Identify, Predict, Decide, Execute"},{"key":"c","text":"Identify, Search, Execute, Decide, Predict"},{"key":"d","text":"Execute, Predict, Search, Decide, Identify"}]'::jsonb, 'b', 'prevention-model'),
  (v_course, NULL, 'mc', 'Accumulating 15 points in Georgia within what window leads to suspension?',
   '[{"key":"a","text":"12 months"},{"key":"b","text":"24 months"},{"key":"c","text":"36 months"},{"key":"d","text":"48 months"}]'::jsonb, 'b', 'ga-points'),
  (v_course, NULL, 'tf', 'A clean 3-year record with no at-fault claims is among the criteria for the statutory insurance discount for drivers 25+.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'discount-eligibility');

  -- M2-tagged (Human Factors)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'A cognitive distraction is best described as:',
   '[{"key":"a","text":"Eyes off the road"},{"key":"b","text":"Hands off the wheel"},{"key":"c","text":"Mind off the driving task"},{"key":"d","text":"Feet off the pedals"}]'::jsonb, 'c', 'distraction'),
  (v_course, NULL, 'mc', 'Under the Hands-Free Act, which is permitted while driving?',
   '[{"key":"a","text":"Reading a text at a red light in traffic"},{"key":"b","text":"A single-touch or voice-activated, hands-free call"},{"key":"c","text":"Recording video of the road"},{"key":"d","text":"Holding the phone to navigate"}]'::jsonb, 'b', 'hands-free'),
  (v_course, NULL, 'tf', 'Drowsiness can impair reaction time and judgment to a degree comparable to alcohol.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'fatigue'),
  (v_course, NULL, 'mc', 'At about 55 mph, a vehicle travels roughly the length of a football field in about:',
   '[{"key":"a","text":"5 seconds"},{"key":"b","text":"15 seconds"},{"key":"c","text":"30 seconds"},{"key":"d","text":"1 second"}]'::jsonb, 'a', 'distraction');

  -- M3-tagged (Impairment)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'Alcohol primarily acts on the body as a:',
   '[{"key":"a","text":"Stimulant"},{"key":"b","text":"Depressant"},{"key":"c","text":"Hallucinogen"},{"key":"d","text":"Neutral substance"}]'::jsonb, 'b', 'alcohol-effects'),
  (v_course, NULL, 'mc', 'What actually lowers a person''s blood alcohol concentration over time?',
   '[{"key":"a","text":"Coffee"},{"key":"b","text":"A cold shower"},{"key":"c","text":"Time"},{"key":"d","text":"Exercise"}]'::jsonb, 'c', 'alcohol-effects'),
  (v_course, NULL, 'tf', 'A DUI conviction generally disqualifies a driver from the clean-record insurance discount.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'dui-law'),
  (v_course, NULL, 'mc', 'Combining alcohol with prescription medication generally:',
   '[{"key":"a","text":"Cancels out impairment"},{"key":"b","text":"Has no effect"},{"key":"c","text":"Multiplies impairment"},{"key":"d","text":"Improves reaction time"}]'::jsonb, 'c', 'drugs');

  -- M4-tagged (Space, Speed & Control)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'If you are being tailgated, the safest response is to:',
   '[{"key":"a","text":"Brake-check the tailgater"},{"key":"b","text":"Increase your front following gap and let them pass"},{"key":"c","text":"Speed up well over the limit"},{"key":"d","text":"Stop in the lane"}]'::jsonb, 'b', 'space-management'),
  (v_course, NULL, 'mc', 'The Super Speeder fee applies to driving at least how fast anywhere in Georgia?',
   '[{"key":"a","text":"75 mph"},{"key":"b","text":"80 mph"},{"key":"c","text":"85 mph"},{"key":"d","text":"90 mph"}]'::jsonb, 'c', 'super-speeder'),
  (v_course, NULL, 'mc', 'The additional state Super Speeder fee (on top of local fines) is:',
   '[{"key":"a","text":"$100"},{"key":"b","text":"$200"},{"key":"c","text":"$500"},{"key":"d","text":"$50"}]'::jsonb, 'b', 'super-speeder'),
  (v_course, NULL, 'mc', 'The correct safe-passing sequence is:',
   '[{"key":"a","text":"Signal, pass, check mirror"},{"key":"b","text":"Mirror, signal, check blind spot, pass, return when you can see the vehicle in your mirror"},{"key":"c","text":"Pass first, then signal"},{"key":"d","text":"Honk, then pass"}]'::jsonb, 'b', 'passing'),
  (v_course, NULL, 'mc', 'Average driver reaction time is approximately:',
   '[{"key":"a","text":"3/4 of a second"},{"key":"b","text":"3 seconds"},{"key":"c","text":"5 seconds"},{"key":"d","text":"1/10 of a second"}]'::jsonb, 'a', 'stopping-distance'),
  (v_course, NULL, 'mc', 'The highest-conflict location on most trips, requiring extra scanning, is:',
   '[{"key":"a","text":"A straight rural road"},{"key":"b","text":"An intersection"},{"key":"c","text":"A parking lot exit"},{"key":"d","text":"A highway on-ramp"}]'::jsonb, 'b', 'intersections');

  -- M5-tagged (Sharing the Road & GA Law)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'When you cannot safely move over for a stopped emergency vehicle, Georgia law requires you to:',
   '[{"key":"a","text":"Maintain the speed limit"},{"key":"b","text":"Slow down below the speed limit and be prepared to stop"},{"key":"c","text":"Stop immediately in your lane"},{"key":"d","text":"Speed up to clear the area"}]'::jsonb, 'b', 'move-over'),
  (v_course, NULL, 'mc', 'When approaching a stopped school bus with red flashing lights and an extended stop arm, you generally must:',
   '[{"key":"a","text":"Pass slowly on the left"},{"key":"b","text":"Stop"},{"key":"c","text":"Honk and proceed"},{"key":"d","text":"Continue at reduced speed"}]'::jsonb, 'b', 'school-bus'),
  (v_course, NULL, 'mc', 'When passing a bicyclist in Georgia you should:',
   '[{"key":"a","text":"Pass as closely as possible"},{"key":"b","text":"Allow a safe lateral buffer when passing"},{"key":"c","text":"Honk continuously"},{"key":"d","text":"Speed up to pass quickly within inches"}]'::jsonb, 'b', 'vulnerable-users'),
  (v_course, NULL, 'mc', 'At a roundabout you must:',
   '[{"key":"a","text":"Yield to traffic already in the circle"},{"key":"b","text":"Always stop before entering"},{"key":"c","text":"Take the right-of-way over circulating traffic"},{"key":"d","text":"Enter at full speed"}]'::jsonb, 'a', 'right-of-way'),
  (v_course, NULL, 'tf', 'Airbags are supplemental to seat belts, not a replacement for them.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'occupant-protection'),
  (v_course, NULL, 'mc', 'Large trucks have large blind spots known as:',
   '[{"key":"a","text":"Crumple zones"},{"key":"b","text":"No-Zones"},{"key":"c","text":"Dead lanes"},{"key":"d","text":"Safe zones"}]'::jsonb, 'b', 'vulnerable-users');

  -- M6-tagged (Conditions, Emergencies & Crash Response)
  INSERT INTO dd_questions (course_id, module_id, qtype, prompt, choices, correct_key, objective_tag) VALUES
  (v_course, NULL, 'mc', 'Hydroplaning risk is typically greatest:',
   '[{"key":"a","text":"After several hours of steady rain"},{"key":"b","text":"During the first minutes of rainfall"},{"key":"c","text":"Only on dry roads"},{"key":"d","text":"At very low speeds"}]'::jsonb, 'b', 'adverse-conditions'),
  (v_course, NULL, 'mc', 'With anti-lock brakes (ABS) in an emergency stop you should:',
   '[{"key":"a","text":"Pump the brakes rapidly"},{"key":"b","text":"Apply steady, firm pressure and steer"},{"key":"c","text":"Tap the brakes lightly"},{"key":"d","text":"Use the parking brake"}]'::jsonb, 'b', 'emergency-maneuvers'),
  (v_course, NULL, 'mc', 'If your brakes fail, an appropriate response is to:',
   '[{"key":"a","text":"Shift to neutral immediately and turn off the engine"},{"key":"b","text":"Pump the brakes, downshift, and apply the parking brake gradually"},{"key":"c","text":"Steer into oncoming traffic"},{"key":"d","text":"Close your eyes"}]'::jsonb, 'b', 'emergency-maneuvers'),
  (v_course, NULL, 'mc', 'At night you should drive so that you can stop within:',
   '[{"key":"a","text":"Twice your headlight range"},{"key":"b","text":"The distance illuminated by your headlights"},{"key":"c","text":"100 feet regardless of lighting"},{"key":"d","text":"The length of the road"}]'::jsonb, 'b', 'adverse-conditions'),
  (v_course, NULL, 'tf', 'After a crash, moving vehicles out of travel lanes when safe helps prevent secondary collisions.',
   '[{"key":"T","text":"True"},{"key":"F","text":"False"}]'::jsonb, 'T', 'crash-response');

  RAISE NOTICE 'dd seed: Georgia 6-Hour Defensive Driving course seeded (course %).', v_course;
END $$;
