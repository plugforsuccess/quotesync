-- ============================================================================
-- Defensive Driving — Phase 5 discount-queue operations (staff)
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER so staff can read enriched rows (cert + enrollment + the
-- assignee's profile name) and mutate work items without granting broad table
-- access. Access is gated inside each function by dd_is_staff()/dd_is_principal.
--
--   dd_queue_list()        -> enriched, oldest-new-first work list (staff+principal)
--   dd_assignable_staff()  -> internal users a work item can be assigned to
--   dd_queue_update(...)   -> staff-only mutation; stamps processed_by/at on
--                             status change.
-- ============================================================================

CREATE OR REPLACE FUNCTION dd_queue_list()
RETURNS TABLE (
  id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  policy_ref TEXT,
  notes TEXT,
  certificate_id UUID,
  certificate_uid TEXT,
  issued_at TIMESTAMPTZ,
  insured_name TEXT,
  insured_user_id UUID,
  assigned_to UUID,
  assignee_name TEXT,
  age_days INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    q.id, q.status, q.created_at, q.updated_at, q.policy_ref, q.notes,
    q.certificate_id, c.certificate_uid, c.issued_at,
    COALESCE(c.student_name_snapshot, e.student_name_snapshot) AS insured_name,
    q.insured_user_id,
    q.assigned_to, ap.full_name AS assignee_name,
    EXTRACT(DAY FROM (now() - q.created_at))::int AS age_days
  FROM dd_discount_queue q
  JOIN dd_certificates c ON c.id = q.certificate_id
  JOIN dd_enrollments e  ON e.id = q.enrollment_id
  LEFT JOIN profiles ap  ON ap.id = q.assigned_to
  WHERE dd_is_staff() OR dd_is_principal()
  ORDER BY
    CASE q.status WHEN 'new' THEN 0 WHEN 'in_review' THEN 1 WHEN 'applied' THEN 2
                  WHEN 'completed' THEN 3 ELSE 4 END,
    q.created_at ASC;
$$;

CREATE OR REPLACE FUNCTION dd_assignable_staff()
RETURNS TABLE (id UUID, name TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, COALESCE(NULLIF(p.full_name, ''), p.email) AS name
  FROM profiles p
  WHERE (dd_is_staff() OR dd_is_admin())
    AND (
      p.is_platform_user = true
      OR EXISTS (
        SELECT 1 FROM agency_memberships m
        WHERE m.user_id = p.id AND m.status = 'active'
          AND m.agency_role IN ('producer', 'manager', 'owner', 'employee', 'principal')
      )
    )
  ORDER BY name;
$$;

CREATE OR REPLACE FUNCTION dd_queue_update(
  p_id UUID,
  p_status TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_policy_ref TEXT DEFAULT NULL,
  p_clear_assignee BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF NOT dd_is_staff() THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('new','in_review','applied','completed','archived') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT status INTO v_old_status FROM dd_discount_queue WHERE id = p_id;
  IF v_old_status IS NULL THEN RAISE EXCEPTION 'queue item not found'; END IF;

  UPDATE dd_discount_queue
     SET status      = COALESCE(p_status, status),
         assigned_to = CASE WHEN p_clear_assignee THEN NULL ELSE COALESCE(p_assigned_to, assigned_to) END,
         notes       = COALESCE(p_notes, notes),
         policy_ref  = COALESCE(p_policy_ref, policy_ref),
         processed_by = CASE WHEN p_status IS NOT NULL AND p_status <> v_old_status THEN auth.uid() ELSE processed_by END,
         processed_at = CASE WHEN p_status IS NOT NULL AND p_status <> v_old_status THEN now() ELSE processed_at END
   WHERE id = p_id
   RETURNING status INTO v_new_status;

  RETURN jsonb_build_object('id', p_id, 'status', v_new_status);
END;
$$;

REVOKE ALL ON FUNCTION dd_queue_list()        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION dd_assignable_staff()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION dd_queue_update(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dd_queue_list()        TO authenticated;
GRANT EXECUTE ON FUNCTION dd_assignable_staff()  TO authenticated;
GRANT EXECUTE ON FUNCTION dd_queue_update(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
