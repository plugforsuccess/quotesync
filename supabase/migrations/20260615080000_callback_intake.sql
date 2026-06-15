-- ============================================================================
-- Callback intake — voicemail → front-desk callback → routed task to the rep
-- ============================================================================
-- When a licensed rep leaves a voicemail, the case is flagged awaiting_callback.
-- The (unlicensed) front desk is RLS-blocked from the case itself, so two
-- SECURITY DEFINER functions give them exactly what they need and nothing more:
--   * fd_expected_callbacks() — minimal routing fields only (name, phone, rep,
--     coarse reason). No premium/coverage ever leaves the licensed boundary.
--   * fd_log_callback() — creates a callback service task routed to the rep and
--     clears the flag, without granting the front desk write access to the case.
-- ============================================================================

ALTER TABLE public.renewal_cases ADD COLUMN IF NOT EXISTS awaiting_callback boolean NOT NULL DEFAULT false;
ALTER TABLE public.pending_cases ADD COLUMN IF NOT EXISTS awaiting_callback boolean NOT NULL DEFAULT false;

-- Minimal, compliance-safe projection of who's expecting a callback. Scoped to
-- the caller's agency; returns only routing fields.
CREATE OR REPLACE FUNCTION public.fd_expected_callbacks()
RETURNS TABLE (
  case_type text, case_id uuid, customer_name text, customer_phone text,
  rep_name text, reason text, since timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT 'renewal'::text, r.id, r.customer_name, COALESCE(r.customer_phone, r.phone),
         NULLIF(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
         'Renewal'::text, r.last_attempt_at
  FROM renewal_cases r
  LEFT JOIN employees e ON e.id = r.assigned_to_id
  WHERE r.awaiting_callback = true
    AND r.status NOT IN ('confirmed','lost','auto_resolved','unreachable')
    AND r.agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active')
  UNION ALL
  SELECT 'cancel'::text, p.id, p.customer_name, p.phone,
         NULLIF(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), ''),
         'Billing / Cancellation'::text, p.last_attempt_at
  FROM pending_cases p
  LEFT JOIN employees e ON e.id = p.assigned_to_id
  WHERE p.awaiting_callback = true
    AND p.status NOT IN ('saved','rewritten','lost','auto_resolved','cancelled','requested_cancellation')
    AND p.agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active');
$$;

REVOKE ALL ON FUNCTION public.fd_expected_callbacks() FROM public;
GRANT EXECUTE ON FUNCTION public.fd_expected_callbacks() TO authenticated;

-- Front desk logs the returned call: routes a high-priority callback task to the
-- rep who left the voicemail and clears the flag. Runs definer-side so the front
-- desk never needs write access to the licensed case tables.
CREATE OR REPLACE FUNCTION public.fd_log_callback(p_case_type text, p_case_id uuid, p_note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_agency uuid; v_name text; v_phone text; v_rep uuid; v_type text; v_task uuid;
BEGIN
  IF p_case_type = 'renewal' THEN
    SELECT agency_id, customer_name, COALESCE(customer_phone, phone), assigned_to_id
      INTO v_agency, v_name, v_phone, v_rep FROM renewal_cases WHERE id = p_case_id;
    v_type := 'premium';
  ELSIF p_case_type = 'cancel' THEN
    SELECT agency_id, customer_name, phone, assigned_to_id
      INTO v_agency, v_name, v_phone, v_rep FROM pending_cases WHERE id = p_case_id;
    v_type := 'billing';
  ELSE
    RAISE EXCEPTION 'invalid case type';
  END IF;

  IF v_agency IS NULL THEN RAISE EXCEPTION 'case not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM agency_memberships
                 WHERE user_id = auth.uid() AND agency_id = v_agency AND status = 'active') THEN
    RAISE EXCEPTION 'not authorized for this agency';
  END IF;

  INSERT INTO service_tasks (agency_id, task_type, title, detail, priority,
      customer_name, customer_phone, assigned_to_id, source, source_case_type, source_case_id)
  VALUES (v_agency, v_type, 'Callback — customer returned voicemail',
      p_note, 'high', v_name, v_phone, v_rep, 'inbound_call', p_case_type, p_case_id)
  RETURNING id INTO v_task;

  IF p_case_type = 'renewal' THEN
    UPDATE renewal_cases SET awaiting_callback = false WHERE id = p_case_id;
  ELSE
    UPDATE pending_cases SET awaiting_callback = false WHERE id = p_case_id;
  END IF;

  RETURN v_task;
END $$;

REVOKE ALL ON FUNCTION public.fd_log_callback(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.fd_log_callback(text, uuid, text) TO authenticated;
