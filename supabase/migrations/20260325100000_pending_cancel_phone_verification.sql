-- Add phone column to pending_cancel_events (missing, renewal_events has it)
ALTER TABLE public.pending_cancel_events
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- Add phone number normalization helper function
-- Strips all non-digit characters: '770-365-6824' → '7703656824'
CREATE OR REPLACE FUNCTION public.normalize_phone(p TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE AS $$
  SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g');
$$;
