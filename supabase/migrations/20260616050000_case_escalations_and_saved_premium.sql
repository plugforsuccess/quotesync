-- ============================================================================
-- Escalation hand-off + audit trail, cancel saved-premium, rep cross-sell refer
-- ============================================================================
-- Three go-live gaps in the employee workflow:
--
-- 1. ESCALATION was relabel-only. A rep marking "Escalate to Agent" flipped a
--    status badge but nothing moved: nobody was notified, no audit trail, and
--    cancels had no escalation path at all. This adds a first-class
--    `case_escalations` record + RPCs that (a) flag the case as needing a
--    licensed agent/principal, (b) drop an in-context case note (audit), and
--    (c) notify every agency principal. The principal works an Escalations
--    inbox and resolves each one — a real hand-off, not a relabel.
--
-- 2. CANCEL SAVES captured no explicit dollar value (only premium_at_risk, or
--    rewrite_new_premium on a rewrite). `pending_cases.saved_premium` mirrors
--    the renewal column so a straight reinstatement save records what premium
--    was preserved.
--
-- 3. CROSS-SELL had no rep hand-off to sales. `cross_sell_cases.upload_batch_id`
--    becomes nullable so a rep can refer an opportunity spotted on a retention
--    call straight onto the Cross-Sell board (match_type 'rep_referral').
-- ============================================================================

-- ── 1. Escalations ──────────────────────────────────────────────────────────
create table if not exists public.case_escalations (
  id                uuid primary key default gen_random_uuid(),
  agency_id         uuid not null,
  case_type         text not null check (case_type in ('renewal','cancel')),
  case_id           uuid not null,
  policy_no         text,
  customer_name     text,
  reason            text,          -- short category (e.g. "Needs principal approval")
  note              text,          -- free-text context from the rep
  status            text not null default 'open' check (status in ('open','resolved')),
  escalated_by_id   uuid,          -- employees.id
  escalated_by_user uuid,          -- auth.uid()
  resolved_by_id    uuid,          -- employees.id (principal who cleared it)
  resolution_note   text,
  resolved_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists idx_case_escalations_agency_status on public.case_escalations(agency_id, status);
create index if not exists idx_case_escalations_case          on public.case_escalations(case_type, case_id);

alter table public.case_escalations enable row level security;

-- Active members read their agency's escalations: the rep sees the open flag on
-- their own case, the principal works the inbox. Writes happen only through the
-- SECURITY DEFINER RPCs below, so no insert/update policy is granted.
drop policy if exists "members read agency escalations" on public.case_escalations;
create policy "members read agency escalations" on public.case_escalations
  for select using (
    exists (
      select 1 from public.agency_memberships m
      where m.user_id = auth.uid()
        and m.agency_id = case_escalations.agency_id
        and m.status = 'active'::membership_status
    )
  );

-- Raise an escalation: record it, flag the case, drop an audit note, notify the
-- principals. SECURITY DEFINER with an active-membership guard so a rep can do
-- all of this for their own agency without broad write grants.
create or replace function public.escalate_case(
  p_case_type text, p_case_id uuid, p_reason text, p_note text
) returns uuid
language plpgsql security definer set search_path = public
as $function$
declare
  v_agency uuid; v_policy text; v_customer text;
  v_emp uuid; v_emp_name text; v_esc uuid;
  v_reason text := nullif(trim(p_reason), '');
  v_note   text := nullif(trim(p_note), '');
begin
  if p_case_type = 'renewal' then
    select agency_id, policy_no, customer_name into v_agency, v_policy, v_customer
    from public.renewal_cases where id = p_case_id;
  elsif p_case_type = 'cancel' then
    select agency_id, policy_no, customer_name into v_agency, v_policy, v_customer
    from public.pending_cases where id = p_case_id;
  else
    raise exception 'invalid case_type %', p_case_type;
  end if;
  if v_agency is null then raise exception 'case not found'; end if;

  if not exists (
    select 1 from public.agency_memberships m
    where m.user_id = auth.uid() and m.agency_id = v_agency
      and m.status = 'active'::membership_status
  ) then
    raise exception 'not authorized';
  end if;

  select id, coalesce(preferred_name, first_name) || ' ' || last_name
    into v_emp, v_emp_name
    from public.employees
   where org_id = v_agency and auth_user_id = auth.uid()
   limit 1;

  insert into public.case_escalations
    (agency_id, case_type, case_id, policy_no, customer_name, reason, note,
     escalated_by_id, escalated_by_user)
  values
    (v_agency, p_case_type, p_case_id, v_policy, v_customer, v_reason, v_note,
     v_emp, auth.uid())
  returning id into v_esc;

  if p_case_type = 'renewal' then
    update public.renewal_cases set
      status = 'escalated',
      human_followup_required = true,
      followup_reason = coalesce(v_reason, 'escalated'),
      followup_notes  = coalesce(v_note, followup_notes),
      updated_at = now()
    where id = p_case_id;
  else
    update public.pending_cases set
      human_only = true,
      human_only_reason = coalesce(v_reason, 'escalated'),
      human_followup_required = true,
      followup_reason = coalesce(v_reason, 'escalated'),
      followup_notes  = coalesce(v_note, followup_notes),
      updated_at = now()
    where id = p_case_id;
  end if;

  insert into public.case_notes
    (agency_id, case_type, case_id, policy_no, customer_name, note_type, tags,
     body, author_id, author_name)
  values
    (v_agency, p_case_type, p_case_id, v_policy, v_customer, 'escalation',
     array['escalation'],
     'Escalated to agent'
       || coalesce(' — ' || v_reason, '')
       || coalesce(': ' || v_note, ''),
     v_emp, v_emp_name);

  insert into public.notifications (user_id, type, title, message, metadata)
  select m.user_id, 'case_escalation',
         'Case escalated: ' || coalesce(v_customer, 'a customer'),
         coalesce(v_reason, 'Needs a licensed agent')
           || coalesce(' — ' || v_note, ''),
         jsonb_build_object('escalation_id', v_esc, 'case_type', p_case_type,
                            'case_id', p_case_id, 'policy_no', v_policy)
  from public.agency_memberships m
  where m.agency_id = v_agency
    and m.agency_role = 'principal'
    and m.status = 'active'::membership_status;

  return v_esc;
end;
$function$;
grant execute on function public.escalate_case(text, uuid, text, text) to authenticated;

-- Resolve an escalation — principals only (the hand-off destination owns clearing it).
create or replace function public.resolve_escalation(p_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare v_agency uuid; v_emp uuid;
begin
  select agency_id into v_agency from public.case_escalations where id = p_id;
  if v_agency is null then raise exception 'escalation not found'; end if;

  if not exists (
    select 1 from public.agency_memberships m
    where m.user_id = auth.uid() and m.agency_id = v_agency
      and m.agency_role = 'principal' and m.status = 'active'::membership_status
  ) then
    raise exception 'not authorized';
  end if;

  select id into v_emp from public.employees
   where org_id = v_agency and auth_user_id = auth.uid() limit 1;

  update public.case_escalations set
    status = 'resolved',
    resolved_by_id = v_emp,
    resolution_note = nullif(trim(p_note), ''),
    resolved_at = now()
  where id = p_id;
end;
$function$;
grant execute on function public.resolve_escalation(uuid, text) to authenticated;

-- ── 2. Cancel saved-premium ─────────────────────────────────────────────────
alter table public.pending_cases add column if not exists saved_premium numeric;
comment on column public.pending_cases.saved_premium is
  'Annual premium preserved when a pending-cancel case is saved (reinstatement). '
  'Mirrors renewal_cases.saved_premium; rewrites still use rewrite_new_premium.';

-- ── 3. Rep-sourced cross-sell referrals ─────────────────────────────────────
-- Cross-sell cases were import-only (upload_batch_id NOT NULL). Allow a rep to
-- refer an opportunity spotted on a retention call (no upload batch behind it).
alter table public.cross_sell_cases alter column upload_batch_id drop not null;
