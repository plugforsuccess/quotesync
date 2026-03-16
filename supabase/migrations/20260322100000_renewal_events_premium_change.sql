ALTER TABLE public.renewal_events
  ADD COLUMN IF NOT EXISTS premium_old        NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS premium_change     NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS premium_change_pct NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS original_year      INTEGER,
  ADD COLUMN IF NOT EXISTS years_prior        INTEGER,
  ADD COLUMN IF NOT EXISTS easy_pay           BOOLEAN;
