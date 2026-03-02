-- Migration: 016_security_hardening.sql
-- Security hardening for lead acquisition funnel
-- Fixes: F-01 (RLS insert policy), adds TCPA consent columns (F-04)

-- ============================================================================
-- F-01: Restrict RLS insert policy on leads table
-- The previous policy had WITH CHECK (true) which allowed ANY role (including
-- anon) to insert arbitrary rows. This is dangerous because anon key is
-- exposed in client-side code.
--
-- Fix: Drop the overly permissive policy. Create a narrow anon policy that
-- only allows status='partial' inserts (for Step 1 qualifier), and rely on
-- service_role (which bypasses RLS) for Edge Function inserts.
-- ============================================================================

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "Service role can insert leads" ON leads;

-- Narrow anon insert policy: only partial leads from the funnel qualifier
-- This allows the Step 1 client-side insert (uses anon key) but restricts
-- what can be inserted. Attacker impact is limited to creating partial leads
-- (no phone number, no SMS/call triggered).
CREATE POLICY "Anon can insert partial leads only"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (
    status = 'partial'
    AND source = 'funnel'
    AND phone IS NULL
    AND first_name IS NULL
    AND last_name IS NULL
    AND email IS NULL
  );

-- Note: service_role bypasses RLS entirely, so Edge Functions (create-lead,
-- etc.) continue to work without any policy.

-- ============================================================================
-- F-04: Add TCPA consent tracking columns
-- Required for legal compliance with SMS/call automation.
-- ============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_given_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_ip text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_version text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_user_agent text;
