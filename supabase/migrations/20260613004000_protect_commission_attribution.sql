-- ============================================================================
-- Protect commission attribution from rep tampering
-- ============================================================================
-- revenue_entries and employee_producer_codes drive who gets paid commission.
-- Their write policies allowed ANY active agency member, so a rep could
-- reassign revenue_entries.producer_id to themselves (steal a colleague's
-- commission) or remap a producer code. Verified gap via pg_policies.
--
-- Fix is surgical to avoid breaking the legitimate upload upsert:
--   * revenue_entries — a trigger blocks CHANGING producer attribution unless
--     the caller is a manager/principal. Non-attribution upserts (premium,
--     last_seen) by any member still work; service/cron (no auth.uid) exempt.
--   * employee_producer_codes — code→commission mapping is management-only
--     (set during onboarding by a principal/manager anyway).
-- ============================================================================

-- ── revenue_entries: guard producer attribution ─────────────────────────────
CREATE OR REPLACE FUNCTION public.guard_revenue_attribution()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.producer_id IS DISTINCT FROM OLD.producer_id
     AND auth.uid() IS NOT NULL                                   -- service/cron exempt
     AND NOT public.has_agency_role(NEW.agency_id, 'manager'::agency_role) THEN
    RAISE EXCEPTION 'Reassigning commission attribution requires a manager or principal.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_revenue_attribution_guard ON public.revenue_entries;
CREATE TRIGGER trg_revenue_attribution_guard
  BEFORE UPDATE ON public.revenue_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_attribution();

-- ── employee_producer_codes: management-only writes ─────────────────────────
DROP POLICY IF EXISTS employee_producer_codes_insert ON public.employee_producer_codes;
CREATE POLICY employee_producer_codes_insert ON public.employee_producer_codes
  FOR INSERT WITH CHECK (public.has_agency_role(agency_id, 'manager'::agency_role));

DROP POLICY IF EXISTS employee_producer_codes_update ON public.employee_producer_codes;
CREATE POLICY employee_producer_codes_update ON public.employee_producer_codes
  FOR UPDATE USING (public.has_agency_role(agency_id, 'manager'::agency_role))
  WITH CHECK (public.has_agency_role(agency_id, 'manager'::agency_role));
