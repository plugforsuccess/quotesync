-- Contact lists: the principal makes lists (e.g. "Didn't Upload", "Frat Brothers"); anyone
-- on the team adds people to them (Quick Send, the lead workspace); the principal imports,
-- manages and emails them. A list can run a follow-up sequence (up to 3 emails, each on
-- its own day; supabase/functions/list-followups) that stops when the person uploads,
-- gets quoted, or unsubscribes. Wording is shared by all lists unless a list is customized.
-- Hide, don't delete: lists are archived, never removed.
create table if not exists public.contact_lists (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references public.agencies(id) on delete cascade,
  name               text not null check (length(trim(name)) between 1 and 80),
  follow_up_enabled  boolean not null default false,
  -- The sequence: [{ day, on }] for emails 1-3; days count from when the person was added.
  sequence           jsonb not null default '[{"day":3,"on":true},{"day":10,"on":true},{"day":30,"on":true}]'::jsonb,
  custom_emails      boolean not null default false, -- this list's own wording (email.list.<id>.stepN.*)
  is_default         boolean not null default false,
  archived_at        timestamptz,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now()
);
create index if not exists contact_lists_agency_idx on public.contact_lists (agency_id);
-- One default list per agency (the one producers see picked).
create unique index if not exists contact_lists_one_default on public.contact_lists (agency_id) where is_default and archived_at is null;

create table if not exists public.contact_list_members (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.contact_lists(id) on delete cascade,
  agency_id         uuid not null references public.agencies(id) on delete cascade,
  first_name        text not null check (length(trim(first_name)) between 1 and 80),
  last_name         text,
  email             text not null check (email ~* '^[^\s@]+@[^\s@]+\.[a-z]{2,}$'),
  phone             text,
  notes             text,
  source            text not null default 'app' check (source in ('app', 'quick_send', 'import')),
  lead_id           uuid references public.leads(id) on delete set null,
  added_by          uuid default auth.uid(),
  added_by_name     text,
  steps_sent        smallint not null default 0, -- follow-up emails sent so far
  last_sent_at      timestamptz,
  stopped_reason    text check (stopped_reason in ('uploaded', 'quoted', 'unsubscribed')),
  created_at        timestamptz not null default now()
);
create unique index if not exists contact_list_members_one_email on public.contact_list_members (list_id, lower(email));
create index if not exists contact_list_members_agency_idx on public.contact_list_members (agency_id, created_at desc);

alter table public.contact_lists enable row level security;
alter table public.contact_list_members enable row level security;

-- Lists: everyone on the team sees them (to pick one); only the principal makes or changes them.
drop policy if exists contact_lists_select on public.contact_lists;
create policy contact_lists_select on public.contact_lists for select to authenticated
  using (exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.agency_id = contact_lists.agency_id and m.status = 'active'));
drop policy if exists contact_lists_insert on public.contact_lists;
create policy contact_lists_insert on public.contact_lists for insert to authenticated
  with check (public.has_agency_role(agency_id, 'principal'));
drop policy if exists contact_lists_update on public.contact_lists;
create policy contact_lists_update on public.contact_lists for update to authenticated
  using (public.has_agency_role(agency_id, 'principal')) with check (public.has_agency_role(agency_id, 'principal'));

-- People: anyone on the team adds to a live list of their agency; the principal sees and
-- manages everyone; a producer sees only the people they added.
drop policy if exists contact_list_members_select on public.contact_list_members;
create policy contact_list_members_select on public.contact_list_members for select to authenticated
  using (public.has_agency_role(agency_id, 'principal') or added_by = auth.uid());
drop policy if exists contact_list_members_insert on public.contact_list_members;
create policy contact_list_members_insert on public.contact_list_members for insert to authenticated
  with check (
    exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.agency_id = contact_list_members.agency_id and m.status = 'active')
    and exists (select 1 from public.contact_lists l where l.id = list_id and l.agency_id = contact_list_members.agency_id and l.archived_at is null)
    and (added_by = auth.uid() or public.has_agency_role(agency_id, 'principal'))
  );
drop policy if exists contact_list_members_update on public.contact_list_members;
create policy contact_list_members_update on public.contact_list_members for update to authenticated
  using (public.has_agency_role(agency_id, 'principal')) with check (public.has_agency_role(agency_id, 'principal'));
drop policy if exists contact_list_members_delete on public.contact_list_members;
create policy contact_list_members_delete on public.contact_list_members for delete to authenticated
  using (public.has_agency_role(agency_id, 'principal'));

-- The principal sees who unsubscribed (dd_email_opt_outs is the agency-wide "don't email" list).
drop policy if exists dd_email_opt_outs_principal_select on public.dd_email_opt_outs;
create policy dd_email_opt_outs_principal_select on public.dd_email_opt_outs for select to authenticated
  using (exists (select 1 from public.agency_memberships m where m.user_id = auth.uid() and m.status = 'active' and m.agency_role = 'principal'));

-- Follow-ups go out every morning at 10:17 Eastern (15:17 UTC; 14:17 during daylight time).
select cron.unschedule('list-followups') where exists (select 1 from cron.job where jobname = 'list-followups');
select cron.schedule('list-followups', '17 15 * * *', $$
  select net.http_post(
    url := 'https://ghnpzllykteelveezhnv.supabase.co/functions/v1/list-followups',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_buYz6tKABrI7M1J1uUSdlw_Z9pR56cP'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$$);

NOTIFY pgrst, 'reload schema';
