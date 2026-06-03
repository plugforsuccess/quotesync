-- Allow an employee to clear their OWN must_reset_password flag.
-- The employees table RLS only permits principals/managers/admins to UPDATE,
-- so a regular employee completing the forced password reset could not clear
-- the flag (the UPDATE silently affected 0 rows), trapping them in a redirect
-- loop back to /my/change-password. This SECURITY DEFINER function clears only
-- that single flag for the calling user's own active row -- nothing else is
-- mutable and no privilege is gained.
create or replace function public.clear_my_must_reset_password()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update employees
     set must_reset_password = false,
         updated_at = now()
   where auth_user_id = auth.uid()
     and employment_status = 'active';
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

revoke all on function public.clear_my_must_reset_password() from public;
grant execute on function public.clear_my_must_reset_password() to authenticated;
