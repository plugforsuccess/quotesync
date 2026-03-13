-- Producer Attribution: add bind_id and producer_name to revenue_entries
-- bind_id = the Bind ID from Allstate's New Business Details report
-- producer_name = resolved employee name (or "CCC" for call center)

ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS bind_id       TEXT,
  ADD COLUMN IF NOT EXISTS producer_name TEXT;

-- Index for producer-level queries
CREATE INDEX IF NOT EXISTS idx_revenue_entries_producer
  ON public.revenue_entries (agency_id, producer_name)
  WHERE producer_name IS NOT NULL;
