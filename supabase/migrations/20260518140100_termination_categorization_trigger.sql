-- ============================================================================
-- Auto-categorize lapse_events rows on insert
-- ============================================================================

-- ─── 1. Trigger function ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_lapse_event_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only set if not already explicitly provided
  IF NEW.termination_category_id IS NULL THEN
    NEW.termination_category_id := public.categorize_termination_reason(
      NEW.agency_id,
      NEW.termination_reason
    );
  END IF;
  RETURN NEW;
END $$;

-- ─── 2. Trigger ──────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_lapse_events_categorize ON public.lapse_events;
CREATE TRIGGER trg_lapse_events_categorize
  BEFORE INSERT ON public.lapse_events
  FOR EACH ROW EXECUTE FUNCTION public.set_lapse_event_category();

-- Also fire on UPDATE if termination_reason changes
CREATE OR REPLACE FUNCTION public.recategorize_lapse_event_on_reason_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.termination_reason IS DISTINCT FROM OLD.termination_reason THEN
    NEW.termination_category_id := public.categorize_termination_reason(
      NEW.agency_id,
      NEW.termination_reason
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lapse_events_recategorize ON public.lapse_events;
CREATE TRIGGER trg_lapse_events_recategorize
  BEFORE UPDATE ON public.lapse_events
  FOR EACH ROW EXECUTE FUNCTION public.recategorize_lapse_event_on_reason_change();

-- ─── 3. Backfill existing rows ───────────────────────────────────────────────
-- Update every existing lapse_event so it gets categorized.

UPDATE public.lapse_events
   SET termination_category_id = public.categorize_termination_reason(
         agency_id, termination_reason
       )
 WHERE termination_category_id IS NULL;

-- ─── 4. Bulk-recategorize RPC for the alias-management UI ────────────────────
-- After a principal adds/edits an alias, they expect existing rows with that
-- raw reason to be re-categorized immediately. This RPC scopes the recompute
-- to one agency + one raw_reason at a time so the call is bounded.

CREATE OR REPLACE FUNCTION public.recategorize_lapse_events_for_reason(
  p_agency_id UUID,
  p_raw_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row_count INTEGER;
BEGIN
  -- Authorize: caller must be a principal of the agency.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_memberships
    WHERE user_id = auth.uid()
      AND agency_id = p_agency_id
      AND agency_role = 'principal'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only principals can recategorize lapse events';
  END IF;

  UPDATE public.lapse_events
     SET termination_category_id = public.categorize_termination_reason(p_agency_id, p_raw_reason)
   WHERE agency_id = p_agency_id
     AND lower(trim(termination_reason)) = lower(trim(p_raw_reason));

  GET DIAGNOSTICS _row_count = ROW_COUNT;
  RETURN _row_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.recategorize_lapse_events_for_reason(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recategorize_lapse_events_for_reason(UUID, TEXT) TO authenticated;
