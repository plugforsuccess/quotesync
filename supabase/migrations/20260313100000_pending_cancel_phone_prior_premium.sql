ALTER TABLE public.pending_cancel_events
  ADD COLUMN IF NOT EXISTS phone          text,
  ADD COLUMN IF NOT EXISTS prior_premium  numeric(10,2),
  ADD COLUMN IF NOT EXISTS item_count     integer;
