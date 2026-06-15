-- ============================================================================
-- renewal_cases.saved_premium — the premium a renewal was saved AT
-- ============================================================================
-- Renewal cases store `premium` (the carrier's renewal OFFER) but nothing for
-- the number the agent negotiated the customer down to. This column captures
-- that final agreed premium, recorded at the save moment (status = confirmed).
--
-- "Premium saved" = premium (offer) − saved_premium, surfaced inline in the
-- renewal modal and aggregated into the retention scorecard. This turns a save
-- from "we kept them" into "we kept them AND cut $X off the offer" — the
-- intervention-dollar instrumentation the OS audit flagged as missing.
--
-- NOTE: the frontend (renewal save modal + scorecard tile) reads/writes this
-- column, so apply this migration BEFORE shipping that frontend.
-- ============================================================================

ALTER TABLE public.renewal_cases
  ADD COLUMN IF NOT EXISTS saved_premium NUMERIC(10,2);

COMMENT ON COLUMN public.renewal_cases.saved_premium IS
  'Final annual premium the renewal was saved at (what the customer agreed to pay). Saved offer − saved_premium = premium reduced. Captured on confirmed renewals.';
