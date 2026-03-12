-- Add columns that the hook/dashboard depend on but were never formally migrated
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS issued_date  DATE,
  ADD COLUMN IF NOT EXISTS policy_no    TEXT,
  ADD COLUMN IF NOT EXISTS tier         TEXT DEFAULT 'monoline',
  ADD COLUMN IF NOT EXISTS item_count   INTEGER NOT NULL DEFAULT 1;

-- Backfill issued_date from date for existing rows
UPDATE public.revenue_entries
  SET issued_date = date
  WHERE issued_date IS NULL;

-- Now make issued_date NOT NULL going forward
ALTER TABLE public.revenue_entries
  ALTER COLUMN issued_date SET NOT NULL;

-- Unique constraint required by the upload upsert (onConflict: "agency_id,policy_no")
-- Only rows WITH a policy_no are upserted; NULL policy_no rows are plain-inserted
ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_agency_policy_no_uq UNIQUE (agency_id, policy_no);

-- Expand the product CHECK to include new product types
ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_product_check;
ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_product_check
    CHECK (product IN ('auto', 'ho', 'renters', 'landlord', 'specialty_auto', 'pup', 'manufactured', 'other'));

-- Index for date-range queries using issued_date (matches hook query pattern)
CREATE INDEX IF NOT EXISTS revenue_entries_agency_issued_date_idx
  ON public.revenue_entries (agency_id, issued_date DESC);

COMMENT ON COLUMN public.revenue_entries.item_count IS
  'Number of insurable items on this policy (e.g. vehicles on an auto policy). HO/Condo is always 1.';
