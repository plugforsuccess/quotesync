-- Inbound vs outbound on a retention attempt. Default 'outbound' (the rep dialed
-- the customer) so existing rows and all proactive logging are unaffected.
-- 'inbound' marks a call the CUSTOMER initiated, so it can be split out of the
-- proactive worked/reached metrics — an inbound call isn't outreach the rep made,
-- and crediting it as such inflates the daily targets and overstates saves.

ALTER TABLE public.renewal_attempts
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound';
ALTER TABLE public.pending_cancel_attempts
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'renewal_attempts_direction_chk') THEN
    ALTER TABLE public.renewal_attempts
      ADD CONSTRAINT renewal_attempts_direction_chk CHECK (direction IN ('inbound','outbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pending_cancel_attempts_direction_chk') THEN
    ALTER TABLE public.pending_cancel_attempts
      ADD CONSTRAINT pending_cancel_attempts_direction_chk CHECK (direction IN ('inbound','outbound'));
  END IF;
END $$;

-- This project's PostgREST auto-reload is unreliable; without this the API keeps
-- a stale schema cache and rejects inserts/selects that reference the new column.
NOTIFY pgrst, 'reload schema';
