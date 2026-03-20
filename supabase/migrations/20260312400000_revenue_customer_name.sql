-- customer_name is PII — treat as sensitive data.
-- Display only in internal admin views. Never expose in exports or producer-facing UI.
ALTER TABLE public.revenue_entries
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

COMMENT ON COLUMN public.revenue_entries.customer_name
  IS 'PII — insured full name from Allstate NB report. Internal admin use only. Exclude from exports and non-admin UI.';
