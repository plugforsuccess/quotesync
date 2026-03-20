-- ============================================================================
-- MT-07: Add base_commission_floor to agency_carrier_config
-- This replaces the hardcoded BASE_COMMISSION = 9 in FunnelDashboardPage.
-- ============================================================================

ALTER TABLE agency_carrier_config
  ADD COLUMN IF NOT EXISTS base_commission_floor NUMERIC(5,2) DEFAULT 9.0;

UPDATE agency_carrier_config
  SET base_commission_floor = 9.0
  WHERE base_commission_floor IS NULL;

COMMENT ON COLUMN agency_carrier_config.base_commission_floor IS 'Base commission floor percentage (e.g. 9.0 for 9% Allstate base)';
