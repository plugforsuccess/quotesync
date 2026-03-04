-- Migration: Add address_source column to leads table
-- Tracks whether address was entered via Google Places Autocomplete or manually
-- File: 20260304000000_add_address_source.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS address_source text DEFAULT 'manual_entry'
  CHECK (address_source IN ('google_autocomplete', 'manual_entry'));

COMMENT ON COLUMN leads.address_source IS 'How the address was entered: google_autocomplete or manual_entry';
