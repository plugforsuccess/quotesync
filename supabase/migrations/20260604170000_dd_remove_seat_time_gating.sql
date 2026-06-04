-- ============================================================================
-- Defensive Driving — remove seat-time gating
-- ----------------------------------------------------------------------------
-- Progression is now content/quiz based, not time based:
--   * a module is complete when its knowledge check is passed (no time floor);
--   * the final exam unlocks when all modules are complete (no total-time floor).
-- Seat-time columns and dd_heartbeat are left in place but unused.
-- ============================================================================

CREATE OR REPLACE FUNCTION dd_submit_knowledge_check(p_module_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_course UUID; v_enr UUID; v_threshold INT;
  v_total INT; v_correct INT; v_score NUMERIC; v_pass BOOLEAN; v_completed TIMESTAMPTZ;
BEGIN
  SELECT m.course_id INTO v_course FROM dd_modules m WHERE m.id = p_module_id;
  IF v_course IS NULL THEN RAISE EXCEPTION 'module not found'; END IF;

  v_enr := dd_active_enrollment_for_module(p_module_id);
  IF v_enr IS NULL THEN RAISE EXCEPTION 'no active enrollment'; END IF;

  SELECT pass_threshold_pct INTO v_threshold FROM dd_courses WHERE id = v_course;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE p_answers->>(q.id::text) = q.correct_key)
    INTO v_total, v_correct
    FROM dd_questions q WHERE q.module_id = p_module_id AND q.is_active = true;
  IF v_total = 0 THEN RAISE EXCEPTION 'no questions for module'; END IF;

  v_score := ROUND((v_correct::numeric / v_total) * 100, 2);
  v_pass := v_score >= v_threshold;

  INSERT INTO dd_module_progress (enrollment_id, module_id, seconds_spent, kc_passed)
  VALUES (v_enr, p_module_id, 0, v_pass)
  ON CONFLICT (enrollment_id, module_id)
  DO UPDATE SET kc_passed = dd_module_progress.kc_passed OR v_pass;

  SELECT completed_at INTO v_completed
    FROM dd_module_progress WHERE enrollment_id = v_enr AND module_id = p_module_id;
  IF v_pass AND v_completed IS NULL THEN
    UPDATE dd_module_progress SET completed_at = now()
     WHERE enrollment_id = v_enr AND module_id = p_module_id;
    v_completed := now();
  END IF;

  RETURN jsonb_build_object(
    'score_pct', v_score, 'passed', v_pass, 'total', v_total, 'correct', v_correct,
    'threshold', v_threshold, 'completed', v_completed IS NOT NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION dd_start_exam(p_course_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enr UUID; v_qcount INT; v_retake INT; v_cooldown INT;
  v_modules INT; v_completed INT;
  v_attempts INT; v_last_submit TIMESTAMPTZ; v_passed BOOLEAN;
  v_attempt_no INT; v_attempt_id UUID; v_qids UUID[]; v_questions JSONB;
BEGIN
  SELECT e.id INTO v_enr FROM dd_enrollments e
   WHERE e.course_id = p_course_id AND e.user_id = auth.uid()
     AND e.status IN ('active', 'completed') LIMIT 1;
  IF v_enr IS NULL THEN RAISE EXCEPTION 'no enrollment'; END IF;

  SELECT exam_question_count, retake_limit, retake_cooldown_seconds
    INTO v_qcount, v_retake, v_cooldown FROM dd_courses WHERE id = p_course_id;

  SELECT COUNT(*) INTO v_modules FROM dd_modules WHERE course_id = p_course_id;
  SELECT COUNT(*) FILTER (WHERE mp.completed_at IS NOT NULL) INTO v_completed
    FROM dd_modules m
    LEFT JOIN dd_module_progress mp ON mp.module_id = m.id AND mp.enrollment_id = v_enr
   WHERE m.course_id = p_course_id;
  IF v_completed < v_modules THEN RAISE EXCEPTION 'exam locked'; END IF;

  SELECT EXISTS (SELECT 1 FROM dd_exam_attempts WHERE enrollment_id = v_enr AND passed) INTO v_passed;
  IF v_passed THEN RAISE EXCEPTION 'already passed'; END IF;

  SELECT COUNT(*), MAX(submitted_at) INTO v_attempts, v_last_submit
    FROM dd_exam_attempts WHERE enrollment_id = v_enr;
  IF v_attempts >= v_retake THEN RAISE EXCEPTION 'no attempts remaining'; END IF;
  IF v_last_submit IS NOT NULL AND v_last_submit + make_interval(secs => v_cooldown) > now() THEN
    RAISE EXCEPTION 'cooldown active';
  END IF;

  SELECT array_agg(s.id),
         jsonb_agg(jsonb_build_object(
           'id', s.id, 'qtype', s.qtype, 'prompt', s.prompt,
           'choices', (SELECT jsonb_agg(c ORDER BY random()) FROM jsonb_array_elements(s.choices) c)))
    INTO v_qids, v_questions
  FROM (
    SELECT id, qtype, prompt, choices FROM dd_questions
     WHERE course_id = p_course_id AND module_id IS NULL AND is_active = true
     ORDER BY random() LIMIT v_qcount
  ) s;

  v_attempt_no := v_attempts + 1;
  INSERT INTO dd_exam_attempts (enrollment_id, attempt_no, started_at, question_ids)
  VALUES (v_enr, v_attempt_no, now(), v_qids) RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id, 'attempt_no', v_attempt_no,
    'question_count', COALESCE(array_length(v_qids, 1), 0), 'questions', v_questions
  );
END;
$$;
