-- Affiliates agree to the Affiliate Program Terms and to texts about the program: on the
-- application (required box) or, for someone signed up in Quick Send, on portal step 1
-- before the W-9. Kept as proof: when, which version, the exact words, and the IP.

alter table public.rate_check_partner_applications
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_text text;

alter table public.rate_check_promoters
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists terms_text text,
  add column if not exists terms_ip text;

NOTIFY pgrst, 'reload schema';
