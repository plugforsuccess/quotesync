-- Add renewal_status and email columns to renewal_events
-- renewal_status: captures the Allstate report status (e.g. "Renewal Not Taken")
-- email: captured from Insured Email column for outreach

ALTER TABLE public.renewal_events
  ADD COLUMN IF NOT EXISTS renewal_status TEXT;

ALTER TABLE public.renewal_events
  ADD COLUMN IF NOT EXISTS email TEXT;
