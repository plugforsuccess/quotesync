-- Rate Check contact step: first + last name, and a code by email as well as by text.
--   rate_check_otps: a code is for a phone (text) or an email (email). Same table, same
--   10-minute codes, hashed; rate-check requires a verified one of each when OTP is on.
--   rate_checks.last_name: the form now asks for it (leads already had last_name).
alter table public.rate_check_otps add column if not exists channel text not null default 'sms';
alter table public.rate_check_otps add column if not exists email text;
alter table public.rate_check_otps alter column phone drop not null;
alter table public.rate_check_otps drop constraint if exists rate_check_otps_channel_check;
alter table public.rate_check_otps add constraint rate_check_otps_channel_check check (
  (channel = 'sms' and phone is not null) or (channel = 'email' and email is not null));
create index if not exists rate_check_otps_email_session on public.rate_check_otps (email, session_id) where email is not null;

alter table public.rate_checks add column if not exists last_name text;

NOTIFY pgrst, 'reload schema';
