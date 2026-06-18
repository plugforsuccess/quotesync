-- ============================================================================
-- service_tasks — close the attribution hole + capture completion detail
-- ============================================================================
-- #3: created_by_id is sourced from the employees table, so a member without an
--     employee row (e.g. the principal) created tasks with NULL attribution.
--     Add created_by_user = auth.uid(), always stamped, so there's never a hole.
-- #6: a task could be marked done with no record of what was done. Add an
--     optional completion_note (the UI requires it for billing/coverage/premium).
-- ============================================================================

ALTER TABLE public.service_tasks
  ADD COLUMN IF NOT EXISTS created_by_user uuid,
  ADD COLUMN IF NOT EXISTS completion_note text;

CREATE OR REPLACE FUNCTION public.stamp_service_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_emp FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.created_by_id IS NULL THEN NEW.created_by_id := v_emp; END IF;
    -- Always stamp the auth user, even when there's no employee row — this is
    -- the no-hole attribution fallback.
    IF NEW.created_by_user IS NULL THEN NEW.created_by_user := auth.uid(); END IF;
    IF NEW.requires_license IS NOT DISTINCT FROM false
       AND NEW.task_type IN ('coverage','premium') THEN
      NEW.requires_license := true;
    END IF;
  END IF;

  NEW.updated_at := now();

  IF NEW.status IN ('done','cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by_id := COALESCE(NEW.completed_by_id, v_emp);
  ELSIF NEW.status NOT IN ('done','cancelled') THEN
    NEW.completed_at := NULL;
    NEW.completed_by_id := NULL;
  END IF;

  RETURN NEW;
END $$;
