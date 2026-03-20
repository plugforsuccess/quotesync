-- Add producer_id as a nullable UUID FK to employees
-- Populated at upload time by resolving bind_id → employee_producer_codes → employees.id
-- producer_name (text) is retained for display and backwards compatibility

ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS producer_id UUID REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_revenue_entries_producer_id
  ON public.revenue_entries (agency_id, producer_id)
  WHERE producer_id IS NOT NULL;

-- Backfill existing rows where producer_name can be matched to an employee
-- Best-effort; CCC and unmatched rows remain NULL
UPDATE public.revenue_entries re
SET producer_id = e.id
FROM public.employees e
WHERE re.agency_id = e.org_id
  AND re.producer_name IS NOT NULL
  AND re.producer_name != 'CCC'
  AND (
    e.preferred_name = re.producer_name
    OR (e.first_name || ' ' || e.last_name) = re.producer_name
  )
  AND re.producer_id IS NULL;

COMMENT ON COLUMN public.revenue_entries.producer_id IS
  'FK to employees.id. Resolved at upload time via employee_producer_codes (bind_id → employee). NULL for CCC/call-center or unmatched entries.';
