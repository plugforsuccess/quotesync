-- 020: Add current carrier columns and Allstate conflict flag to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_auto_carrier TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_home_carrier TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS allstate_conflict BOOLEAN DEFAULT false;

COMMENT ON COLUMN leads.current_auto_carrier IS 'Self-reported current auto insurance carrier';
COMMENT ON COLUMN leads.current_home_carrier IS 'Self-reported current home insurance carrier';
COMMENT ON COLUMN leads.allstate_conflict IS 'True if any product line is currently with Allstate — cannot write this business';

CREATE INDEX IF NOT EXISTS idx_leads_allstate_conflict
  ON leads(allstate_conflict) WHERE allstate_conflict = true;
