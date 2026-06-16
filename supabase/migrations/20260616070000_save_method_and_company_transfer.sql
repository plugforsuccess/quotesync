-- ============================================================================
-- Save method capture + "Company transfer" tactic
-- ============================================================================
-- "What saved the customer" was only capturable in the attempt-level
-- intervention picker, and that list had no entry for a COMPANY TRANSFER —
-- moving the policy to a different writing company/tier for a better rate, a
-- critical retention method. This:
--   1. captures the primary save tactic on the case itself, at the moment the
--      renewal is confirmed / the cancel is saved (renewal_cases.save_method,
--      pending_cases.save_method), so saves are queryable by tactic; and
--   2. adds Company transfer to intervention_types so the detailed attempt
--      picker (elasticity capture) is complete too.
-- ============================================================================

alter table public.renewal_cases add column if not exists save_method text;
alter table public.pending_cases add column if not exists save_method text;
comment on column public.renewal_cases.save_method is
  'Primary tactic that saved the renewal (e.g. company_transfer), set at confirm.';
comment on column public.pending_cases.save_method is
  'Primary tactic that saved the cancellation (e.g. company_transfer), set at save.';

insert into public.intervention_types
  (code, display_name, description, captures_premium, captures_competitor, sort_order, is_active)
select 'company_transfer', 'Company transfer',
       'Moved the policy to a different writing company/tier for a better rate',
       true, false, 0, true
where not exists (
  select 1 from public.intervention_types where code = 'company_transfer'
);
