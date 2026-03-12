-- Add allstate_bind_id to employees table
-- This is the Bind ID from Allstate's New Business Details report (e.g. "A0C2667", "SGAQSB0E")
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS allstate_bind_id TEXT;

-- Index for fast lookup during upload parsing
CREATE INDEX IF NOT EXISTS idx_employees_allstate_bind_id
  ON public.employees (allstate_bind_id)
  WHERE allstate_bind_id IS NOT NULL;

-- Add bind_id and producer_name to revenue_entries
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS bind_id       TEXT,
  ADD COLUMN IF NOT EXISTS producer_name TEXT;
