-- The carrier name as printed, kept alongside the normalised carrier so an
-- unrecognised insurer ('Other') still shows its real name in the inbox.
alter table public.rate_checks add column if not exists carrier_raw text;
NOTIFY pgrst, 'reload schema';
