-- Migration: Rename agency roles to match Allstate industry terminology
-- "owner" (agency principal) → "agent"
-- "agent" (licensed staff) → "producer"
--
-- IMPORTANT: The ALTER TYPE must be committed before the UPDATEs can use 'producer'.
-- In Supabase, run the ALTER TYPE as a separate statement first if running manually.
-- In migration files, each migration runs in its own transaction so this is safe.

-- Add 'producer' to the agency_role enum
ALTER TYPE agency_role ADD VALUE IF NOT EXISTS 'producer';

-- Step 1: Move current 'agent' values to 'producer' (these are the staff/salespeople)
UPDATE agency_memberships SET agency_role = 'producer' WHERE agency_role = 'agent';

-- Step 2: Rename 'owner' to 'agent' (these are the agency principals)
UPDATE agency_memberships SET agency_role = 'agent' WHERE agency_role = 'owner';

-- Step 3: Set the agency principal (one per agency)
-- Only Cam Wiley is the agent (principal) of Wiley-Wilson Agency
UPDATE agency_memberships SET agency_role = 'agent'
WHERE user_id = 'e9d8df65-7cd4-419b-b53c-6a8e734dc1c1';  -- Cam Wiley (insuredbycam@gmail.com)

-- Also update agency_users table (legacy table, has 'admin' values from initial setup)
UPDATE agency_users SET role = 'producer' WHERE role = 'agent';
UPDATE agency_users SET role = 'agent' WHERE role IN ('owner');

-- Enforce one agent (principal) per agency
CREATE UNIQUE INDEX IF NOT EXISTS one_agent_per_agency
ON agency_memberships (agency_id)
WHERE agency_role = 'agent';
