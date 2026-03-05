-- Migration: Drop FK constraint on rc_call_log.employee_user_id
--
-- The original schema explicitly noted "no FK" on this column because
-- employee_user_id stores either employees.auth_user_id (for linked users)
-- or employees.id (for unlinked users who don't have app logins).
--
-- The FK to auth.users(id) was added unintentionally and prevents attributing
-- calls to employees without login accounts (e.g., CS reps tracked for
-- performance but who never log into the app themselves).

ALTER TABLE rc_call_log
  DROP CONSTRAINT IF EXISTS rc_call_log_employee_user_id_fkey;
