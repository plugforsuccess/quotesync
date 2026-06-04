-- ============================================================================
-- Defensive Driving — Phase 6 overview aggregates (principal + staff)
-- ----------------------------------------------------------------------------
-- Read-only KPIs, 12-week throughput, and staff workload for the dashboard.
-- SECURITY DEFINER, gated to staff/principal.
-- ============================================================================

CREATE OR REPLACE FUNCTION dd_queue_overview()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_counts JSONB; v_total INT; v_oldest INT; v_through JSONB; v_workload JSONB;
BEGIN
  IF NOT (dd_is_staff() OR dd_is_principal()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
           'new',       COUNT(*) FILTER (WHERE status='new'),
           'in_review', COUNT(*) FILTER (WHERE status='in_review'),
           'applied',   COUNT(*) FILTER (WHERE status='applied'),
           'completed', COUNT(*) FILTER (WHERE status='completed'),
           'archived',  COUNT(*) FILTER (WHERE status='archived')
         ), COUNT(*)
    INTO v_counts, v_total
    FROM dd_discount_queue;

  SELECT COALESCE(MAX(EXTRACT(DAY FROM now() - created_at)::int), 0)
    INTO v_oldest
    FROM dd_discount_queue WHERE status IN ('new','in_review');

  WITH weeks AS (
    SELECT generate_series(date_trunc('week', now()) - interval '11 weeks',
                           date_trunc('week', now()), interval '1 week') AS wk
  ),
  issued AS (
    SELECT date_trunc('week', issued_at) wk, COUNT(*) n
      FROM dd_certificates
     WHERE issued_at >= date_trunc('week', now()) - interval '11 weeks'
     GROUP BY 1
  ),
  done AS (
    SELECT date_trunc('week', COALESCE(processed_at, updated_at)) wk, COUNT(*) n
      FROM dd_discount_queue
     WHERE status='completed'
       AND COALESCE(processed_at, updated_at) >= date_trunc('week', now()) - interval '11 weeks'
     GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
           'week', to_char(w.wk, 'Mon DD'),
           'issued', COALESCE(i.n, 0),
           'completed', COALESCE(d.n, 0)
         ) ORDER BY w.wk)
    INTO v_through
    FROM weeks w
    LEFT JOIN issued i ON i.wk = w.wk
    LEFT JOIN done d ON d.wk = w.wk;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'assigned_to', t.assigned_to, 'assignee_name', t.name,
           'new', t.new, 'in_review', t.in_review, 'applied', t.applied,
           'completed', t.completed, 'total', t.total
         ) ORDER BY t.total DESC), '[]'::jsonb)
    INTO v_workload
    FROM (
      SELECT q.assigned_to,
             COALESCE(NULLIF(p.full_name, ''), 'Unassigned') AS name,
             COUNT(*) FILTER (WHERE q.status='new') new,
             COUNT(*) FILTER (WHERE q.status='in_review') in_review,
             COUNT(*) FILTER (WHERE q.status='applied') applied,
             COUNT(*) FILTER (WHERE q.status='completed') completed,
             COUNT(*) total
        FROM dd_discount_queue q
        LEFT JOIN profiles p ON p.id = q.assigned_to
       GROUP BY q.assigned_to, p.full_name
    ) t;

  RETURN jsonb_build_object(
    'total_issued', v_total,
    'counts', v_counts,
    'oldest_unprocessed_age_days', v_oldest,
    'throughput', COALESCE(v_through, '[]'::jsonb),
    'staff_workload', v_workload
  );
END;
$$;

REVOKE ALL ON FUNCTION dd_queue_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dd_queue_overview() TO authenticated;
