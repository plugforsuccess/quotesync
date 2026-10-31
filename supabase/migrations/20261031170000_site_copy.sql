-- Site copy editor: the principal (or a platform admin) edits text on the consumer pages
-- in place. Each edited string is a row keyed by where it appears (e.g. rc.headline);
-- no row means the page's built-in text. Logos uploaded in the editor go to the public
-- site-assets bucket and their URL is stored the same way. Anyone can read (the pages
-- are public); only principals and platform admins can write.

create or replace function public.can_edit_site_copy()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.is_platform_admin()
      or exists (
        select 1 from agency_memberships m
        where m.user_id = auth.uid() and m.status = 'active' and m.agency_role = 'principal'
      );
$$;
revoke execute on function public.can_edit_site_copy() from public, anon;
grant execute on function public.can_edit_site_copy() to authenticated;

create table if not exists public.site_copy (
  key        text primary key check (key ~ '^[a-z0-9][a-z0-9._-]{0,119}$'),
  value      text not null check (char_length(value) <= 4000),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.site_copy enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_copy' and policyname = 'site_copy_read') then
    create policy site_copy_read on public.site_copy for select to anon, authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_copy' and policyname = 'site_copy_write') then
    create policy site_copy_write on public.site_copy for all to authenticated
      using ((select public.can_edit_site_copy())) with check ((select public.can_edit_site_copy()));
  end if;
end $$;

revoke all on public.site_copy from anon, authenticated;
grant select on public.site_copy to anon, authenticated;
grant insert, update, delete on public.site_copy to authenticated;

create or replace function public.site_copy_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists site_copy_touch on public.site_copy;
create trigger site_copy_touch before insert or update on public.site_copy
  for each row execute function public.site_copy_touch();

-- Logos and images uploaded from the editor.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-assets', 'site-assets', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'site_assets_write') then
    create policy site_assets_write on storage.objects for insert to authenticated
      with check (bucket_id = 'site-assets' and (select public.can_edit_site_copy()));
  end if;
end $$;

NOTIFY pgrst, 'reload schema';
