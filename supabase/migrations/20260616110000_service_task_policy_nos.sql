-- ============================================================================
-- service_tasks.policy_nos — a task can span more than one policy
-- ============================================================================
-- Some service tasks pertain to several policies at once (an insurance review
-- across auto + home, an address/billing change touching the whole household).
-- Keep policy_no as the primary (back-compat), and add policy_nos for the full
-- list. Backfill existing rows so policy_nos always carries at least the primary.
-- ============================================================================
alter table public.service_tasks add column if not exists policy_nos text[] not null default '{}';

update public.service_tasks
set policy_nos = array[policy_no]
where (policy_nos is null or array_length(policy_nos, 1) is null)
  and policy_no is not null and trim(policy_no) <> '';
