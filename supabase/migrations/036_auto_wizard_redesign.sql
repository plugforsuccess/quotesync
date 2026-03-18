-- 036_auto_wizard_redesign.sql
-- Auto insurance wizard redesign: new columns for redesigned step sequence

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS currently_insured boolean,
  ADD COLUMN IF NOT EXISTS canopy_mid_funnel_offered boolean DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS canopy_mid_funnel_accepted boolean,
  ADD COLUMN IF NOT EXISTS continuous_insured_duration text
    CHECK (continuous_insured_duration IN ('less_than_6mo', '6mo_to_1yr', '1yr_to_3yr', '3yr_to_5yr', '5yr_plus')),
  ADD COLUMN IF NOT EXISTS incident_free boolean,
  ADD COLUMN IF NOT EXISTS bundle_interest boolean,
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IN ('male', 'female', 'nonbinary', 'prefer_not_to_say')),
  ADD COLUMN IF NOT EXISTS own_or_lease text
    CHECK (own_or_lease IN ('own', 'lease', 'financing')),
  ADD COLUMN IF NOT EXISTS bodily_injury_limits text,
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_state text;

COMMENT ON COLUMN leads.continuous_insured_duration IS 'How long the lead has been continuously insured without a gap.';
COMMENT ON COLUMN leads.bodily_injury_limits IS 'Self-reported current bodily injury limits e.g. "25/50", "100/300".';
