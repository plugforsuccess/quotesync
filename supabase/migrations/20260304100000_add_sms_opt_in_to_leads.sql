-- Migration: Add sms_opt_in column to leads table
-- Required for Task 6: SMS opt-in on ThankYouPage

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT FALSE;
