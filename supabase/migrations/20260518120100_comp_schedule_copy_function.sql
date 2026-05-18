-- ============================================================================
-- Helper RPC: copy_comp_schedule_rates(source_schedule_id, destination_schedule_id)
-- ============================================================================
-- Copies all rates from one schedule into another. Used when the user creates
-- a new schedule via "Copy rates from existing schedule".
--
-- Safety constraints:
--   1. Source and destination must belong to the same agency (no cross-agency leakage).
--   2. Caller must be a principal of that agency.
--   3. Destination must be empty (no existing rates).
-- Returns the count of rows inserted.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.copy_comp_schedule_rates(
  source_schedule_id UUID,
  destination_schedule_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _source_agency UUID;
  _dest_agency UUID;
  _rows_inserted INTEGER;
BEGIN
  SELECT agency_id INTO _source_agency FROM public.agency_comp_schedules
    WHERE id = source_schedule_id;
  SELECT agency_id INTO _dest_agency FROM public.agency_comp_schedules
    WHERE id = destination_schedule_id;

  IF _source_agency IS NULL OR _dest_agency IS NULL THEN
    RAISE EXCEPTION 'Schedule not found';
  END IF;

  IF _source_agency <> _dest_agency THEN
    RAISE EXCEPTION 'Cross-agency copy is not allowed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agency_memberships
    WHERE user_id = auth.uid()
      AND agency_id = _dest_agency
      AND agency_role = 'principal'
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Only principals can copy schedule rates';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agency_commission_rates WHERE schedule_id = destination_schedule_id) THEN
    RAISE EXCEPTION 'Destination schedule already has rates; clear it first';
  END IF;

  INSERT INTO public.agency_commission_rates (agency_id, product_key, tier_key, rate, schedule_id)
  SELECT _dest_agency, r.product_key, r.tier_key, r.rate, destination_schedule_id
  FROM public.agency_commission_rates r
  WHERE r.schedule_id = source_schedule_id;

  GET DIAGNOSTICS _rows_inserted = ROW_COUNT;
  RETURN _rows_inserted;
END $$;

REVOKE EXECUTE ON FUNCTION public.copy_comp_schedule_rates(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.copy_comp_schedule_rates(UUID, UUID) TO authenticated;
