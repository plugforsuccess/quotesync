-- ============================================================================
-- Make the call/attempt evidence log tamper-proof (anti-gaming)
-- ============================================================================
-- The retention bonus and every performance metric are computed from the
-- attempt logs. If a rep can edit that log, the whole system is gameable. Three
-- locks, all enforced in the DB so no client path can bypass them:
--
--  1. Server-authoritative INSERT — an interactive user cannot backdate an
--     attempt (attempted_at is forced to now()) or log it as another rep
--     (employee_id is forced to the caller). Service-role/cron inserts (e.g.
--     AI calls) are untouched.
--  2. Append-only — the permissive "manage (ALL)" policy is removed, so reps
--     can no longer UPDATE or DELETE logged attempts. Corrections are new rows;
--     service_role retains full access for genuine admin fixes.
--  3. Observed truth wins — a renewal the Policy Audit observed as LOST can no
--     longer be re-marked renewed by anyone.
-- ============================================================================

-- ── 1. Server-authoritative attempt inserts ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_attempt_server_authoritative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_emp uuid;
BEGIN
  -- Only interactive callers are constrained; service-role/cron keep their values.
  IF auth.uid() IS NOT NULL THEN
    NEW.attempted_at := now();                                  -- no backdating
    SELECT id INTO v_emp FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
    IF v_emp IS NOT NULL THEN
      NEW.employee_id := v_emp;                                  -- credit follows caller
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stamp_renewal_attempt ON public.renewal_attempts;
CREATE TRIGGER trg_stamp_renewal_attempt
  BEFORE INSERT ON public.renewal_attempts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_attempt_server_authoritative();

DROP TRIGGER IF EXISTS trg_stamp_cancel_attempt ON public.pending_cancel_attempts;
CREATE TRIGGER trg_stamp_cancel_attempt
  BEFORE INSERT ON public.pending_cancel_attempts
  FOR EACH ROW EXECUTE FUNCTION public.stamp_attempt_server_authoritative();

-- ── 2. Append-only RLS ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Agency members can manage renewal_attempts" ON public.renewal_attempts;
DROP POLICY IF EXISTS "Agency members can manage pending_cancel_attempts" ON public.pending_cancel_attempts;

-- Preserve agency-wide read (managers + the verification dashboards) without
-- granting any UPDATE/DELETE. INSERT keeps its existing policy.
DROP POLICY IF EXISTS renewal_attempts_read_agency ON public.renewal_attempts;
CREATE POLICY renewal_attempts_read_agency ON public.renewal_attempts
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM agency_memberships
                  WHERE user_id = auth.uid() AND status = 'active'::membership_status)
  );

DROP POLICY IF EXISTS pending_cancel_attempts_read_agency ON public.pending_cancel_attempts;
CREATE POLICY pending_cancel_attempts_read_agency ON public.pending_cancel_attempts
  FOR SELECT USING (
    agency_id IN (SELECT agency_id FROM agency_memberships
                  WHERE user_id = auth.uid() AND status = 'active'::membership_status)
  );

-- ── 3. Observed truth wins (extend the PR-A renewal save guard) ─────────────
CREATE OR REPLACE FUNCTION public.enforce_renewal_save_has_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- An observed loss (from the Policy Audit census) is ground truth.
  IF OLD.outcome_source = 'observed' AND OLD.final_outcome = 'lost'
     AND NEW.final_outcome = 'renewed' THEN
    RAISE EXCEPTION 'This renewal was observed as lost in the Policy Audit — it cannot be re-marked renewed.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- PR-A: no rep-claimed save without a logged call.
  IF NEW.outcome_source = 'rep' AND NEW.final_outcome = 'renewed'
     AND COALESCE(OLD.final_outcome, '') <> 'renewed'
     AND NOT EXISTS (SELECT 1 FROM public.renewal_attempts ra WHERE ra.renewal_case_id = NEW.id) THEN
    RAISE EXCEPTION 'Log the call before marking this renewal renewed — a recorded save attempt (with the tactic used) is required.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
