-- Migration: V2.1 fixes — add renters carrier + marital status
-- File: 20260302100000_v2_1_fixes.sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_renters_carrier TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS marital_status TEXT;

COMMENT ON COLUMN leads.current_renters_carrier IS 'Current renters insurance carrier';
COMMENT ON COLUMN leads.marital_status IS 'Marital status: single, married, divorced, widowed';
