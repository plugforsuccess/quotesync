-- Partner mailing address, so the W-9 in the partner portal comes pre-filled.
-- Entered by staff when adding a partner (optional) and saved again whenever the
-- partner signs a W-9. Not shown anywhere public.
ALTER TABLE public.rate_check_promoters
  ADD COLUMN IF NOT EXISTS mailing_address text,
  ADD COLUMN IF NOT EXISTS mailing_city_state_zip text;

NOTIFY pgrst, 'reload schema';
