-- Mark as Test: the principal can hide test records (their own test uploads, leads and
-- affiliates) from every staff view and count, and bring them back. Nothing is deleted.
--
-- leads.is_test and rate_check_promoters.is_test join the existing rate_checks.is_test.
-- A restrictive SELECT policy keeps flagged rows out of every signed-in query, so no
-- list, count or payout has to remember to filter them. Edge functions (service role)
-- still see them, so a test affiliate's portal and a test link keep working.
--
-- set_test_flag(kind, id, on): principal only. Marking spreads to what came with it:
--   rate_check → that household (same phone) and its lead
--   lead       → its rate checks
--   affiliate  → the rate checks that came through their link
-- test_records(agency): principal only. What's marked, for the Test Records page.

alter table public.leads                add column if not exists is_test boolean not null default false;
alter table public.rate_check_promoters add column if not exists is_test boolean not null default false;

create policy leads_hide_test on public.leads
  as restrictive for select to authenticated using (not is_test);
create policy rate_check_promoters_hide_test on public.rate_check_promoters
  as restrictive for select to authenticated using (not is_test);
create policy rate_checks_hide_test on public.rate_checks
  as restrictive for select to authenticated using (not is_test);

create or replace function public.is_agency_principal(p_agency uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_memberships
     where user_id = auth.uid() and agency_id = p_agency and agency_role = 'principal' and status = 'active'
  );
$$;

create or replace function public.set_test_flag(p_kind text, p_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agency uuid;
  v_phone text;
  v_lead uuid;
  v_rc int := 0;
  v_leads int := 0;
begin
  if p_kind = 'rate_check' then
    select agency_id, phone, lead_id into v_agency, v_phone, v_lead from public.rate_checks where id = p_id;
  elsif p_kind = 'lead' then
    select agency_id into v_agency from public.leads where id = p_id;
  elsif p_kind = 'affiliate' then
    select agency_id into v_agency from public.rate_check_promoters where id = p_id;
  else
    raise exception 'Unknown kind %', p_kind;
  end if;
  if v_agency is null then raise exception 'Not found'; end if;
  if not public.is_agency_principal(v_agency) then raise exception 'Only the principal can do this.'; end if;

  if p_kind = 'rate_check' then
    update public.rate_checks set is_test = p_on
     where agency_id = v_agency and (id = p_id or (v_phone is not null and phone = v_phone));
    get diagnostics v_rc = row_count;
    update public.leads set is_test = p_on
     where agency_id = v_agency and id in (
       select lead_id from public.rate_checks
        where agency_id = v_agency and lead_id is not null and (id = p_id or (v_phone is not null and phone = v_phone)));
    get diagnostics v_leads = row_count;
  elsif p_kind = 'lead' then
    update public.leads set is_test = p_on where id = p_id;
    v_leads := 1;
    update public.rate_checks set is_test = p_on where agency_id = v_agency and lead_id = p_id;
    get diagnostics v_rc = row_count;
  else
    update public.rate_check_promoters set is_test = p_on where id = p_id;
    update public.rate_checks set is_test = p_on where agency_id = v_agency and promoter_id = p_id;
    get diagnostics v_rc = row_count;
  end if;
  return jsonb_build_object('rate_checks', v_rc, 'leads', v_leads);
end;
$$;

create or replace function public.test_records(p_agency uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_agency_principal(p_agency) then raise exception 'Only the principal can do this.'; end if;
  return jsonb_build_object(
    'rate_checks', coalesce((
      select jsonb_agg(x order by x->>'created_at' desc) from (
        select distinct on (coalesce(phone, id::text)) jsonb_build_object(
          'id', id, 'first_name', first_name, 'phone', phone, 'carrier', carrier, 'policy_type', policy_type, 'created_at', created_at) x
          from public.rate_checks where agency_id = p_agency and is_test
         order by coalesce(phone, id::text), created_at desc) s), '[]'::jsonb),
    'leads', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'first_name', first_name, 'last_name', last_name, 'phone', phone, 'created_at', created_at) order by created_at desc)
        from public.leads where agency_id = p_agency and is_test), '[]'::jsonb),
    'affiliates', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'created_at', created_at) order by created_at desc)
        from public.rate_check_promoters where agency_id = p_agency and is_test), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.set_test_flag(text, uuid, boolean) from public, anon;
revoke all on function public.test_records(uuid) from public, anon;
grant execute on function public.set_test_flag(text, uuid, boolean) to authenticated;
grant execute on function public.test_records(uuid) to authenticated;

NOTIFY pgrst, 'reload schema';
