-- ============================================================================
-- SEED: Allstate GA 2027 (Announced) Demo Schedule
-- ============================================================================
-- DEVELOPMENT-ONLY SEED. Placeholder commission values for the 2027 Allstate
-- Georgia schedule used to demonstrate the comparison UI and announced-schedule
-- alert card.
--
-- BEFORE ANY CUSTOMER DEMO: Replace these placeholder rates with the actual
-- 2027 rates published by Allstate via the CompScheduleAdminPage UI.
--
-- Guard: only seeds for the demo agency UUID '00000000-0000-0000-0000-000000000001'.
-- ============================================================================

DO $$
DECLARE
  _agency_id UUID := '00000000-0000-0000-0000-000000000001';
  _schedule_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = _agency_id) THEN
    RAISE NOTICE 'Demo agency not found; skipping 2027 seed.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_comp_schedules
    WHERE agency_id = _agency_id
      AND carrier_name = 'Allstate'
      AND state_code = 'GA'
      AND schedule_label = 'Allstate GA 2027 (Announced)'
  ) THEN
    RAISE NOTICE 'Allstate GA 2027 demo schedule already seeded; skipping.';
    RETURN;
  END IF;

  INSERT INTO public.agency_comp_schedules (
    agency_id, carrier_name, state_code, schedule_label,
    effective_from, effective_to, is_announced_only, notes
  ) VALUES (
    _agency_id, 'Allstate', 'GA', 'Allstate GA 2027 (Announced)',
    '2027-01-01', NULL, true,
    'PLACEHOLDER DEMO DATA. Replace with real 2027 Allstate Georgia rates ' ||
    'when published. Created by seed migration for development comparison UI.'
  )
  RETURNING id INTO _schedule_id;

  -- Placeholder 2027 rates — deliberately lower than 2026 (the seeded baseline)
  -- so the comparison view will visibly show negative deltas during development.
  -- 2026 reference rates from agency_config_layer seed:
  --   auto:    preferred 0.25, bundled 0.20, monoline 0.15
  --   ho:      preferred 0.29, bundled 0.25, monoline 0.16
  --   renters: preferred 0.26, bundled 0.21, monoline 0.15
  --   other:   preferred 0.26, bundled 0.21, monoline 0.15
  INSERT INTO public.agency_commission_rates (agency_id, schedule_id, product_key, tier_key, rate) VALUES
    (_agency_id, _schedule_id, 'auto',    'preferred', 0.23),
    (_agency_id, _schedule_id, 'auto',    'bundled',   0.18),
    (_agency_id, _schedule_id, 'auto',    'monoline',  0.14),
    (_agency_id, _schedule_id, 'ho',      'preferred', 0.27),
    (_agency_id, _schedule_id, 'ho',      'bundled',   0.23),
    (_agency_id, _schedule_id, 'ho',      'monoline',  0.15),
    (_agency_id, _schedule_id, 'renters', 'preferred', 0.24),
    (_agency_id, _schedule_id, 'renters', 'bundled',   0.19),
    (_agency_id, _schedule_id, 'renters', 'monoline',  0.14),
    (_agency_id, _schedule_id, 'other',   'preferred', 0.24),
    (_agency_id, _schedule_id, 'other',   'bundled',   0.19),
    (_agency_id, _schedule_id, 'other',   'monoline',  0.14);

  RAISE NOTICE 'Seeded Allstate GA 2027 (Announced) demo schedule with placeholder rates.';
END $$;
