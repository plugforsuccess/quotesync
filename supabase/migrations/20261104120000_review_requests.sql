-- Google review asks: the agency's review link (used by the automatic thank-you
-- text sent when a rate check is bound) and when a household was asked, so each
-- household is asked once.
ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS google_review_url text;
ALTER TABLE public.rate_checks ADD COLUMN IF NOT EXISTS review_requested_at timestamptz;

NOTIFY pgrst, 'reload schema';
