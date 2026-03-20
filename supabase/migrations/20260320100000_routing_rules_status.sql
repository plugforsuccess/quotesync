-- ============================================================================
-- MT-06: Add status column to routing_rules for agent self-service territory
-- New rules from agents go in as 'pending_approval' until platform admin approves.
-- ============================================================================

-- Drop existing check constraint if it exists, then add updated one
DO $$
BEGIN
  -- Add status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'routing_rules' AND column_name = 'status'
  ) THEN
    ALTER TABLE routing_rules ADD COLUMN status TEXT DEFAULT 'active';
    ALTER TABLE routing_rules ADD CONSTRAINT routing_rules_status_check
      CHECK (status IN ('active', 'inactive', 'pending_approval'));
  END IF;
END $$;
