-- Rate Check partners: the W-9, completed in the partner portal.
--
-- The finished PDF (the IRS form filled by rate-check-partner) lives in the private
-- partner-w9 bucket at {agency_id}/{promoter_id}/w9-{timestamp}.pdf, readable only by
-- the agency's owner / principal / manager (signed URLs from the Partners tab). The
-- partner row keeps only what the 1099 needs to be matched: TIN type and last 4,
-- the tax classification and the typed signature. The full TIN is never stored in
-- a table. Only the function (service role) writes these columns.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-w9', 'partner-w9', false, 2097152, array['application/pdf'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner_w9_select_managers') then
    create policy partner_w9_select_managers on storage.objects for select to authenticated
      using (bucket_id = 'partner-w9' and exists (
        select 1 from public.agency_memberships m
        where m.user_id = auth.uid() and m.status = 'active'
          and m.agency_role in ('owner', 'principal', 'manager')
          and m.agency_id::text = (storage.foldername(name))[1]));
  end if;
end $$;

alter table public.rate_check_promoters
  add column if not exists w9_tin_type text check (w9_tin_type is null or w9_tin_type in ('ssn', 'ein')),
  add column if not exists w9_tin_last4 text check (w9_tin_last4 is null or w9_tin_last4 ~ '^\d{4}$'),
  add column if not exists w9_tax_class text,
  add column if not exists w9_signed_name text,
  add column if not exists w9_pdf_path text;

comment on column public.rate_check_promoters.w9_tin_last4 is 'Last 4 of the TIN on the W-9; the full number is only in the PDF (partner-w9 bucket).';
comment on column public.rate_check_promoters.w9_pdf_path is 'Completed W-9 PDF in the partner-w9 bucket. Staff open it with a signed URL.';

notify pgrst, 'reload schema';
