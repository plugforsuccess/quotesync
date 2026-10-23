-- Rate Check: the consumer's email, and one-time codes that prove the mobile
-- number is theirs before a dec page is accepted.

alter table public.rate_checks add column if not exists email text;

-- One row per code sent. Codes are stored hashed; a row is spent once verified
-- or expired. Service-role only (the rate-check-otp and rate-check functions).
create table if not exists public.rate_check_otps (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  session_id text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  verified_at timestamptz,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists rate_check_otps_phone_session_idx
  on public.rate_check_otps (phone, session_id, created_at desc);

alter table public.rate_check_otps enable row level security;
-- No policies on purpose: only the service role (edge functions) reads or writes.

comment on table public.rate_check_otps is 'Text-message verification codes for the public Rate Check page (hashed; service role only).';
comment on column public.rate_checks.email is 'Email the consumer typed on the Rate Check page (staff uploads may leave it empty).';

notify pgrst, 'reload schema';
