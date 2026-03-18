-- Save Wizard Enrichment: vehicle details, premium capture, coverage lapse, military status, multiple drivers
ALTER TABLE leads
  -- Vehicle enrichment fields
  ADD COLUMN IF NOT EXISTS vehicle_year integer,
  ADD COLUMN IF NOT EXISTS vehicle_make text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_use text[],
  ADD COLUMN IF NOT EXISTS coverage_lapse text
    CHECK (coverage_lapse IN ('no_lapse','under_30','30_to_90','over_90','never_insured')),
  ADD COLUMN IF NOT EXISTS multiple_drivers boolean,
  ADD COLUMN IF NOT EXISTS veteran_status text
    CHECK (veteran_status IN ('yes','no')),
  -- Premium capture fields
  ADD COLUMN IF NOT EXISTS current_auto_premium integer,
  ADD COLUMN IF NOT EXISTS current_home_premium integer;

COMMENT ON COLUMN leads.current_auto_premium IS 'Self-reported current annual auto premium in dollars. NULL = not provided or skipped.';
COMMENT ON COLUMN leads.current_home_premium IS 'Self-reported current annual home premium in dollars. NULL = not provided or skipped.';
