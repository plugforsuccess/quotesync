-- Rate Check partners: a photo on their share link's landing page ("Javon shared
-- this with you"), shown only after the partner (or the agency, on their say-so)
-- agrees to it.
--
-- Photos live in the public partner-photos bucket at {agency_id}/{promoter_id}.jpg.
-- Partners upload from their portal through the rate-check-partner edge function
-- (service role); owners / principals / managers can upload from the Partners tab.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-photos', 'partner-photos', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

do $$
declare
  op text;
  can_manage text := $q$bucket_id = 'partner-photos' and exists (
      select 1 from public.agency_memberships m
      where m.user_id = auth.uid() and m.status = 'active'
        and m.agency_role in ('owner', 'principal', 'manager')
        and m.agency_id::text = (storage.foldername(name))[1])$q$;
begin
  foreach op in array array['insert', 'update', 'delete'] loop
    if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner_photos_' || op) then
      if op = 'insert' then
        execute format('create policy %I on storage.objects for insert to authenticated with check (%s)', 'partner_photos_' || op, can_manage);
      else
        execute format('create policy %I on storage.objects for %s to authenticated using (%s)', 'partner_photos_' || op, op, can_manage);
      end if;
    end if;
  end loop;
  -- The bucket is public; storage upserts also need a select policy.
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'partner_photos_select') then
    create policy partner_photos_select on storage.objects for select to public using (bucket_id = 'partner-photos');
  end if;
end $$;

alter table public.rate_check_promoters
  add column if not exists photo_url text check (photo_url is null or length(photo_url) <= 500),
  add column if not exists photo_consent_at timestamptz;

grant update (photo_url, photo_consent_at) on public.rate_check_promoters to authenticated;

comment on column public.rate_check_promoters.photo_url is 'Public URL of the partner''s photo (partner-photos bucket), shown on their share link.';
comment on column public.rate_check_promoters.photo_consent_at is 'When the partner agreed to show their photo on their link. The landing page shows the photo only when set.';

notify pgrst, 'reload schema';
