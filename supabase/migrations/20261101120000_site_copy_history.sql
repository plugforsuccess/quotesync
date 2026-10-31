-- Copy editor history: every change to site_copy (edit, restore to original) is kept,
-- so an earlier wording can always be brought back. Readable by the same people who
-- can edit (principals, platform admins); written only by the trigger.

create table if not exists public.site_copy_history (
  id         bigint generated always as identity primary key,
  key        text not null,
  old_value  text,
  new_value  text,          -- null: restored to the page's built-in text
  changed_by uuid default auth.uid(),
  changed_at timestamptz not null default now()
);
create index if not exists site_copy_history_key_idx on public.site_copy_history (key, changed_at desc);

alter table public.site_copy_history enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_copy_history' and policyname = 'site_copy_history_read') then
    create policy site_copy_history_read on public.site_copy_history for select to authenticated
      using ((select public.can_edit_site_copy()));
  end if;
end $$;
revoke all on public.site_copy_history from anon, authenticated;
grant select on public.site_copy_history to authenticated;

create or replace function public.site_copy_log()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'DELETE' then
    insert into site_copy_history (key, old_value, new_value) values (old.key, old.value, null);
    return old;
  end if;
  if tg_op = 'UPDATE' and new.value is not distinct from old.value then
    return new;
  end if;
  insert into site_copy_history (key, old_value, new_value)
  values (new.key, case when tg_op = 'UPDATE' then old.value end, new.value);
  return new;
end $$;

drop trigger if exists site_copy_log on public.site_copy;
create trigger site_copy_log after insert or update or delete on public.site_copy
  for each row execute function public.site_copy_log();

NOTIFY pgrst, 'reload schema';
