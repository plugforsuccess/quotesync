-- ============================================================================
-- PR-A: a "save" cannot be claimed without a logged call
-- ============================================================================
-- Integrity + anti-abuse. The crown-jewel dataset (and the retention bonus) is
-- only trustworthy if every claimed save has a recorded call behind it. These
-- triggers reject a REP-driven "saved" / "renewed" outcome unless at least one
-- attempt has been logged for the case. System closes are exempt by design:
--   * reconcile / auto-resolve set outcome_source 'observed'/'inferred'
--   * the import sets pending status 'lost'/'rewritten'/'auto_resolved'
-- so only the interactive rep path (outcome_source='rep' / status='saved') is
-- gated. Enforced in the DB so it can't be bypassed by a crafted client call.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_renewal_save_has_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.outcome_source = 'rep'
     AND NEW.final_outcome = 'renewed'
     AND COALESCE(OLD.final_outcome, '') <> 'renewed'
     AND NOT EXISTS (
       SELECT 1 FROM public.renewal_attempts ra WHERE ra.renewal_case_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Log the call before marking this renewal renewed — a recorded save attempt (with the tactic used) is required.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_renewal_save_requires_attempt ON public.renewal_cases;
CREATE TRIGGER trg_renewal_save_requires_attempt
  BEFORE UPDATE ON public.renewal_cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_renewal_save_has_attempt();

CREATE OR REPLACE FUNCTION public.enforce_cancel_save_has_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'saved'
     AND COALESCE(OLD.status, '') <> 'saved'
     AND NOT EXISTS (
       SELECT 1 FROM public.pending_cancel_attempts a WHERE a.pending_case_id = NEW.id
     ) THEN
    RAISE EXCEPTION 'Log the call before marking this cancellation saved — a recorded save attempt (with the tactic used) is required.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cancel_save_requires_attempt ON public.pending_cases;
CREATE TRIGGER trg_cancel_save_requires_attempt
  BEFORE UPDATE ON public.pending_cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_cancel_save_has_attempt();
