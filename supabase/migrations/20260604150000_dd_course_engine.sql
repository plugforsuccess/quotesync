-- ============================================================================
-- Defensive Driving — Phase 3 course engine (server-validated)
-- ----------------------------------------------------------------------------
-- All completion logic is server-side (SECURITY DEFINER). The client may submit
-- heartbeats and answers but never writes seconds_spent, kc_passed, or
-- completed_at directly, and never sees correct_key.
--
--   dd_heartbeat(module, seconds)        -> accumulate seat time (bounded)
--   dd_get_module_questions(module)      -> KC questions WITHOUT correct_key
--   dd_submit_knowledge_check(module, a) -> score server-side, set kc_passed
--
-- A module is "completed" only when seconds_spent >= module.min_seconds AND the
-- knowledge check is passed. Both RPCs converge on that rule idempotently.
-- ============================================================================

-- Resolve the caller's active enrollment for a module's course (or NULL).
CREATE OR REPLACE FUNCTION dd_active_enrollment_for_module(p_module_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id
  FROM dd_modules m
  JOIN dd_enrollments e ON e.course_id = m.course_id
  WHERE m.id = p_module_id
    AND e.user_id = auth.uid()
    AND e.status = 'active'
  LIMIT 1;
$$;

-- --- Seat-time heartbeat -----------------------------------------------------
CREATE OR REPLACE FUNCTION dd_heartbeat(p_module_id UUID, p_seconds INT DEFAULT 15)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enr UUID;
  v_min INT;
  v_delta INT;
  v_sec INT;
  v_kc BOOLEAN;
  v_completed TIMESTAMPTZ;
BEGIN
  -- Bound the increment so the client cannot fast-forward seat time.
  v_delta := GREATEST(0, LEAST(COALESCE(p_seconds, 0), 30));

  SELECT min_seconds INTO v_min FROM dd_modules WHERE id = p_module_id;
  IF v_min IS NULL THEN RAISE EXCEPTION 'module not found'; END IF;

  v_enr := dd_active_enrollment_for_module(p_module_id);
  IF v_enr IS NULL THEN RAISE EXCEPTION 'no active enrollment'; END IF;

  INSERT INTO dd_module_progress (enrollment_id, module_id, seconds_spent)
  VALUES (v_enr, p_module_id, 0)
  ON CONFLICT (enrollment_id, module_id) DO NOTHING;

  UPDATE dd_module_progress
     SET seconds_spent = LEAST(seconds_spent + v_delta, v_min)
   WHERE enrollment_id = v_enr AND module_id = p_module_id
   RETURNING seconds_spent, kc_passed, completed_at INTO v_sec, v_kc, v_completed;

  IF v_sec >= v_min AND v_kc AND v_completed IS NULL THEN
    UPDATE dd_module_progress SET completed_at = now()
     WHERE enrollment_id = v_enr AND module_id = p_module_id
     RETURNING completed_at INTO v_completed;
  END IF;

  RETURN jsonb_build_object(
    'seconds_spent', v_sec,
    'min_seconds', v_min,
    'kc_passed', v_kc,
    'completed', v_completed IS NOT NULL
  );
END;
$$;

-- --- Knowledge-check questions (no correct_key) ------------------------------
CREATE OR REPLACE FUNCTION dd_get_module_questions(p_module_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course UUID;
  v_ok BOOLEAN;
  v_qs JSONB;
BEGIN
  SELECT course_id INTO v_course FROM dd_modules WHERE id = p_module_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'module not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM dd_enrollments e
    WHERE e.course_id = v_course AND e.user_id = auth.uid()
      AND e.status IN ('active', 'completed')
  ) INTO v_ok;
  IF NOT v_ok THEN RAISE EXCEPTION 'no enrollment'; END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', id, 'qtype', qtype, 'prompt', prompt, 'choices', choices)
      ORDER BY random()
    ), '[]'::jsonb)
  INTO v_qs
  FROM dd_questions
  WHERE module_id = p_module_id AND is_active = true;

  RETURN v_qs;
END;
$$;

-- --- Knowledge-check scoring (server-side) -----------------------------------
CREATE OR REPLACE FUNCTION dd_submit_knowledge_check(p_module_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course UUID;
  v_enr UUID;
  v_min INT;
  v_threshold INT;
  v_total INT;
  v_correct INT;
  v_score NUMERIC;
  v_pass BOOLEAN;
  v_sec INT;
  v_completed TIMESTAMPTZ;
BEGIN
  SELECT m.course_id, m.min_seconds INTO v_course, v_min FROM dd_modules m WHERE m.id = p_module_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'module not found'; END IF;

  v_enr := dd_active_enrollment_for_module(p_module_id);
  IF v_enr IS NULL THEN RAISE EXCEPTION 'no active enrollment'; END IF;

  SELECT pass_threshold_pct INTO v_threshold FROM dd_courses WHERE id = v_course;

  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE p_answers->>(q.id::text) = q.correct_key)
    INTO v_total, v_correct
    FROM dd_questions q
   WHERE q.module_id = p_module_id AND q.is_active = true;

  IF v_total = 0 THEN RAISE EXCEPTION 'no questions for module'; END IF;

  v_score := ROUND((v_correct::numeric / v_total) * 100, 2);
  v_pass := v_score >= v_threshold;

  INSERT INTO dd_module_progress (enrollment_id, module_id, seconds_spent, kc_passed)
  VALUES (v_enr, p_module_id, 0, v_pass)
  ON CONFLICT (enrollment_id, module_id)
  DO UPDATE SET kc_passed = dd_module_progress.kc_passed OR v_pass;

  SELECT seconds_spent, completed_at INTO v_sec, v_completed
    FROM dd_module_progress WHERE enrollment_id = v_enr AND module_id = p_module_id;

  IF v_pass AND v_sec >= v_min AND v_completed IS NULL THEN
    UPDATE dd_module_progress SET completed_at = now()
     WHERE enrollment_id = v_enr AND module_id = p_module_id;
    v_completed := now();
  END IF;

  RETURN jsonb_build_object(
    'score_pct', v_score,
    'passed', v_pass,
    'total', v_total,
    'correct', v_correct,
    'threshold', v_threshold,
    'seat_time_met', v_sec >= v_min,
    'completed', v_completed IS NOT NULL
  );
END;
$$;

-- --- Privileges: signed-in students only -------------------------------------
REVOKE ALL ON FUNCTION dd_active_enrollment_for_module(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION dd_heartbeat(UUID, INT)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION dd_get_module_questions(UUID)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION dd_submit_knowledge_check(UUID, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION dd_heartbeat(UUID, INT)                TO authenticated;
GRANT EXECUTE ON FUNCTION dd_get_module_questions(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION dd_submit_knowledge_check(UUID, JSONB) TO authenticated;
-- dd_active_enrollment_for_module is a helper; not granted to clients.
