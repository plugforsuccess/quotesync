-- Add housing_situation column to store raw housing answer (own, rent, or other)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS housing_situation text;
COMMENT ON COLUMN leads.housing_situation IS 'Raw housing answer: own, rent, or other';

-- Track whether phone was captured early (before form completion) for speed-to-lead analytics
ALTER TABLE leads ADD COLUMN IF NOT EXISTS early_phone_captured boolean DEFAULT false;
