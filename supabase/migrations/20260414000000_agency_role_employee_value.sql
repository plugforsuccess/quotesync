-- Add 'employee' to the agency_role enum if missing.
-- The send-employee-invite edge function inserts an agency_memberships row
-- with agency_role = 'employee' for each invited employee, granting them
-- read-only agency context so /my/queue, /my/scorecard, /punch resolve.
--
-- Idempotent: only adds the value if it doesn't already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'agency_role'::regtype
    AND enumlabel = 'employee'
  ) THEN
    ALTER TYPE agency_role ADD VALUE 'employee';
  END IF;
END$$;
