-- Add customer_name to revenue_entries for producer drilldown display
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS customer_name TEXT;
