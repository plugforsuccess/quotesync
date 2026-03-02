-- Migration: Add wizard v2 fields to leads table
-- File: 20260302000000_add_wizard_v2_fields.sql

-- New contact/quote fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS street_address TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_unit TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT;

-- Index on date_of_birth for age-based queries
CREATE INDEX IF NOT EXISTS idx_leads_date_of_birth ON leads (date_of_birth);

-- Comment for documentation
COMMENT ON COLUMN leads.date_of_birth IS 'Lead date of birth - required for quoting';
COMMENT ON COLUMN leads.street_address IS 'Street address line 1';
COMMENT ON COLUMN leads.address_unit IS 'Apartment or unit number (optional)';
COMMENT ON COLUMN leads.city IS 'City name - state is always GA';
