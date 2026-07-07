-- ============================================================================
-- No undocumented closes — a rep close must leave a record (anti-blank-close)
-- ============================================================================
-- Principal's rule: a case may not leave the queue with no notes anywhere. The
-- UI enforces it with context (RetentionCancels close paths + the happy-with-
-- policy guard); this trigger is the backstop no client path can bypass, in the
-- same spirit as enforce_*_save_has_attempt and the tamper-proof attempt log.
--
-- What counts as "a record" (mirrors src/lib/caseRecord.js — keep in sync):
--   • any case_notes row for the case (append-only, server-stamped), OR
--   • a non-synthetic call attempt with a note of ≥8 chars, OR
--   • the case's own notes field (≥8 chars), including as set by THIS update.
--
-- Who is guarded — the discriminator is closed_by_id:
--   • Rep closes from the work surface always stamp closed_by_id → guarded.
--   • System closes never do → exempt: the importer's report reconciliation
--     (lost/rewritten/auto_resolved bulk writes), reconcile_renewal_outcomes
--     (observed Policy Audit truth), and any service-role/cron path
--     (auth.uid() IS NULL). Those closes are report-evidenced, not
--     conversation-evidenced, so demanding a typed note there is wrong.
--   • Bookkeeping closes a rep DOES claim (Already Paid, unreachable) satisfy
--     the guard via the auto-written case note the app inserts first.
--
-- Note: this is a workflow guard, not a security boundary — a crafted client
-- could omit closed_by_id to skip it (and forfeit close credit). Acceptable:
-- the goal is stopping accidental blank closes, and credit requires the stamp.

CREATE OR REPLACE FUNCTION public.enforce_case_record_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_record boolean;
BEGIN
  -- Service-role / cron paths are unconstrained.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  -- Only closes that claim a human closer are guarded.
  IF NEW.closed_by_id IS NULL THEN RETURN NEW; END IF;
  -- Only on the transition INTO a terminal status (editing an already-closed
  -- case, or reopening one, is not a close).
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'pending_cases' THEN
    IF NEW.status NOT IN ('saved','rewritten','lost','requested_cancellation','cancelled','auto_resolved') THEN
      RETURN NEW;
    END IF;
    SELECT (length(trim(coalesce(NEW.notes, ''))) >= 8)
        OR EXISTS (SELECT 1 FROM case_notes cn
                   WHERE cn.case_type = 'cancel' AND cn.case_id = NEW.id)
        OR EXISTS (SELECT 1 FROM pending_cancel_attempts pa
                   WHERE pa.pending_case_id = NEW.id
                     AND coalesce(pa.auto_logged, false) = false
                     AND length(trim(coalesce(pa.note, ''))) >= 8)
      INTO has_record;
  ELSE  -- renewal_cases
    IF NEW.status NOT IN ('confirmed','lost','unreachable','auto_resolved') THEN
      RETURN NEW;
    END IF;
    SELECT (length(trim(coalesce(NEW.notes, ''))) >= 8)
        OR EXISTS (SELECT 1 FROM case_notes cn
                   WHERE cn.case_type = 'renewal' AND cn.case_id = NEW.id)
        OR EXISTS (SELECT 1 FROM renewal_attempts ra
                   WHERE ra.renewal_case_id = NEW.id
                     AND coalesce(ra.auto_logged, false) = false
                     AND length(trim(coalesce(ra.note, ''))) >= 8)
      INTO has_record;
  END IF;

  IF NOT has_record THEN
    RAISE EXCEPTION 'This case has no notes on record — add a case-log comment or a note describing the outcome before closing it.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_require_record_close_cancel ON public.pending_cases;
CREATE TRIGGER trg_require_record_close_cancel
  BEFORE UPDATE ON public.pending_cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_case_record_on_close();

DROP TRIGGER IF EXISTS trg_require_record_close_renewal ON public.renewal_cases;
CREATE TRIGGER trg_require_record_close_renewal
  BEFORE UPDATE ON public.renewal_cases
  FOR EACH ROW EXECUTE FUNCTION public.enforce_case_record_on_close();

COMMENT ON FUNCTION public.enforce_case_record_on_close() IS
  'Blocks a rep-claimed close (closed_by_id set) when the case has no case_notes row, no genuine attempt note, and an empty notes field. System closes (no closed_by_id / no auth.uid) pass through.';
