-- Migration: Rename agency roles to match Allstate industry terminology
-- "owner" (agency principal) → "agent"
-- "agent" (licensed staff) → "producer"

-- Step 1: Move current 'agent' values to 'producer' (these are the staff/salespeople)
UPDATE agency_memberships SET agency_role = 'producer' WHERE agency_role = 'agent';

-- Step 2: Rename 'owner' to 'agent' (these are the agency principals)
UPDATE agency_memberships SET agency_role = 'agent' WHERE agency_role = 'owner';

-- Step 3: Set the correct roles for known agency principals
UPDATE agency_memberships SET agency_role = 'agent'
WHERE user_id IN (
  'e9d8df65-7cd4-419b-b53c-6a8e734dc1c1',  -- Cam Wiley (insuredbycam@gmail.com)
  '337b8759-1349-48d3-a616-95c3293f499a'    -- plugforsuccess@gmail.com
);

-- Also update agency_users table (legacy table, has 'admin' values from initial setup)
UPDATE agency_users SET role = 'producer' WHERE role = 'agent';
UPDATE agency_users SET role = 'agent' WHERE role IN ('owner', 'admin');
