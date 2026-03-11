ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.revenue_entries.item_count IS
  'Number of insurable items on this policy (e.g. vehicles on an auto policy). HO/Condo is always 1.';
