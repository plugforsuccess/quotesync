-- Affiliates invite affiliates (credit only, no pay): an application through an
-- affiliate's invite link (/affiliates?aff=CODE) records who invited them, and carries
-- over when the principal adds them. Shown on the staff side and counted in the
-- inviter's portal.

alter table public.rate_check_partner_applications
  add column if not exists invited_by_promoter_id uuid references public.rate_check_promoters(id) on delete set null;

alter table public.rate_check_promoters
  add column if not exists invited_by_promoter_id uuid references public.rate_check_promoters(id) on delete set null;

NOTIFY pgrst, 'reload schema';
