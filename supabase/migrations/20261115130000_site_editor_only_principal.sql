-- Editing the website's wording and pictures (the pencil) is the agency principal's own
-- login only: camwiley@allstate.com. Not other principals, platform admins, staff,
-- affiliates or visitors. The site hides the pencil the same way (src/lib/siteEditor.js);
-- this is what actually stops a save. Covers site_copy writes, site_copy_history reads
-- and site-assets uploads, which all check can_edit_site_copy().
create or replace function public.can_edit_site_copy()
returns boolean language sql stable security definer set search_path = public as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'camwiley@allstate.com'
     and exists (
       select 1 from agency_memberships m
       where m.user_id = auth.uid() and m.status = 'active' and m.agency_role = 'principal'
     );
$$;
revoke execute on function public.can_edit_site_copy() from public, anon;
grant execute on function public.can_edit_site_copy() to authenticated;
