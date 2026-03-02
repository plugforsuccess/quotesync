-- Migration: 019_partial_lead_fix.sql
-- Fix: Step 1 partial lead insert fails with 400 because agency_id is NOT NULL
-- but the client doesn't know which agency to assign yet.
--
-- Solution: Allow anon to read the default agency ID so the client can include
-- it in the partial lead insert. The agency_id NOT NULL constraint is correct
-- and stays — we just provide the default agency at insert time.

-- Allow anon to read the default agency ID (needed for Step 1 partial lead insert)
CREATE POLICY "Anon can read default agency"
  ON agencies FOR SELECT
  TO anon
  USING (is_default = true);
