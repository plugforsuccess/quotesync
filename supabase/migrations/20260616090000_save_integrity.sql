-- ============================================================================
-- Save integrity — keep "auto-recorded" saves honest
-- ============================================================================
-- Marking a save auto-logs the required attempt (so it's one action). That's
-- convenient but gameable — a rep could click "Saved" without doing the work.
-- Three controls:
--   #2 auto_logged flag on attempts — the synthetic attempt is marked so it does
--      NOT count as real outreach/reach in the scorecard. A rep who only clicks
--      "Saved" then shows saves with zero logged calls — an obvious trail.
--   #1 reversed-save reconciliation — a rep-marked save whose policy later turns
--      up in the Allstate termination report (the system of record) is flagged
--      reversed and stops counting as a save. Gaming is caught + clawed back.
--   #3 integrity query — feeds the principal's review surface.
-- ============================================================================

-- #2 — distinguish the auto-recorded attempt from a real dialed call.
alter table public.pending_cancel_attempts add column if not exists auto_logged boolean not null default false;
alter table public.renewal_attempts       add column if not exists auto_logged boolean not null default false;

-- #1 — markers for a save reversed by the system of record.
alter table public.pending_cases add column if not exists save_reversed_at timestamptz;
alter table public.pending_cases add column if not exists save_reversed_reason text;

-- #1 — reconcile: a save whose policy lapsed (per the termination report) around
-- the cancellation it was supposedly saved from never actually held. Flag it.
-- Bounded to 60 days after the save so genuine later churn isn't mislabeled.
-- Idempotent; safe to re-run after each termination/lapse import.
create or replace function public.reconcile_false_saves(p_agency_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $function$
declare n integer;
begin
  if not exists (
    select 1 from public.agency_memberships m
    where m.user_id = auth.uid() and m.agency_id = p_agency_id
      and m.agency_role = 'principal' and m.status = 'active'::membership_status
  ) then
    raise exception 'not authorized';
  end if;

  with reversed as (
    update public.pending_cases pc
      set save_reversed_at = now(),
          save_reversed_reason = 'Allstate termination report shows this policy lapsed after it was marked saved',
          updated_at = now()
    from public.lapse_events le
    where pc.agency_id = p_agency_id
      and pc.status = 'saved'
      and pc.save_reversed_at is null
      and le.agency_id = pc.agency_id
      and le.policy_no = pc.policy_no
      and coalesce(le.backfill, false) = false
      and le.lapse_date >= coalesce(pc.resolution_date, pc.updated_at::date)
      and le.lapse_date <= coalesce(pc.resolution_date, pc.updated_at::date) + 60
    returning pc.id
  )
  select count(*) into n from reversed;
  return n;
end;
$function$;
grant execute on function public.reconcile_false_saves(uuid) to authenticated;

-- #3 — integrity review feed (principal only): reversed saves + "unverified"
-- saves (marked saved with no real logged call, only the auto-record).
create or replace function public.agency_save_integrity(p_agency_id uuid)
returns table (
  kind text, case_id uuid, customer_name text, policy_no text, premium numeric,
  rep_id uuid, rep_name text, resolution_date date, detail text
)
language sql security definer set search_path = public
as $function$
  with guard as (
    select 1 from public.agency_memberships m
    where m.user_id = auth.uid() and m.agency_id = p_agency_id
      and m.agency_role = 'principal' and m.status = 'active'::membership_status
  )
  select 'reversed'::text, pc.id, pc.customer_name, pc.policy_no, pc.premium_at_risk,
         pc.closed_by_id,
         coalesce(e.preferred_name, nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), '')),
         pc.resolution_date, pc.save_reversed_reason
  from public.pending_cases pc
  left join public.employees e on e.id = pc.closed_by_id
  where exists (select 1 from guard)
    and pc.agency_id = p_agency_id and pc.save_reversed_at is not null
  union all
  select 'unverified'::text, pc.id, pc.customer_name, pc.policy_no, pc.premium_at_risk,
         pc.closed_by_id,
         coalesce(e.preferred_name, nullif(trim(coalesce(e.first_name,'') || ' ' || coalesce(e.last_name,'')), '')),
         pc.resolution_date, 'Marked saved with no logged call — only an auto-recorded outcome'
  from public.pending_cases pc
  left join public.employees e on e.id = pc.closed_by_id
  where exists (select 1 from guard)
    and pc.agency_id = p_agency_id and pc.status = 'saved' and pc.save_reversed_at is null
    and not exists (
      select 1 from public.pending_cancel_attempts a
      where a.pending_case_id = pc.id and a.auto_logged = false
    )
  order by resolution_date desc nulls last;
$function$;
grant execute on function public.agency_save_integrity(uuid) to authenticated;
