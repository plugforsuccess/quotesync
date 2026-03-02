-- 018: Add risk screening columns to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS auto_driving_record TEXT
  CHECK (auto_driving_record IN ('clean', '1-2', '3+'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS home_claims_history TEXT
  CHECK (home_claims_history IN ('0-1', '2+'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS risk_flag TEXT
  CHECK (risk_flag IN ('green', 'yellow', 'red'))
  DEFAULT 'green';

COMMENT ON COLUMN leads.auto_driving_record IS 'Self-reported: accidents/tickets in last 3 years. Carrier max: 3 incidents/driver';
COMMENT ON COLUMN leads.home_claims_history IS 'Self-reported: home claims in last 5 years. Carrier max: 1 claim';
COMMENT ON COLUMN leads.risk_flag IS 'Computed risk flag: green=clean, yellow=borderline, red=exceeds carrier limits';
