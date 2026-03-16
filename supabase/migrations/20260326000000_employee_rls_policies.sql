-- Employee-scoped RLS policies
-- Allows employees to read/update their own cases and log attempts,
-- without needing platform_admin or agency membership.

-- Allow employees to read their own cases (pending cancel)
-- Matches: assigned_to_id = their employee id OR opened_by_id = their employee id
CREATE POLICY "Employees can view their own pending cancel cases"
  ON public.pending_cancel_events FOR SELECT
  USING (
    assigned_to_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
    OR
    opened_by_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to update their own cases (log attempts, update status)
CREATE POLICY "Employees can update their own pending cancel cases"
  ON public.pending_cancel_events FOR UPDATE
  USING (
    assigned_to_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to read their own renewal cases
CREATE POLICY "Employees can view their own renewal cases"
  ON public.renewal_events FOR SELECT
  USING (
    assigned_to_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
    OR
    opened_by_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to update their own renewal cases
CREATE POLICY "Employees can update their own renewal cases"
  ON public.renewal_events FOR UPDATE
  USING (
    assigned_to_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to insert attempt logs for their own cases
CREATE POLICY "Employees can log pending cancel attempts"
  ON public.pending_cancel_attempts FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can log renewal attempts"
  ON public.renewal_attempts FOR INSERT
  WITH CHECK (
    employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to read their own attempt logs
CREATE POLICY "Employees can view their own pending cancel attempts"
  ON public.pending_cancel_attempts FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Employees can view their own renewal attempts"
  ON public.renewal_attempts FOR SELECT
  USING (
    employee_id IN (
      SELECT id FROM public.employees WHERE auth_user_id = auth.uid()
    )
  );

-- Allow employees to read their own employee record
CREATE POLICY "Employees can view their own record"
  ON public.employees FOR SELECT
  USING (auth_user_id = auth.uid());

-- Allow employees to read rc_call_log for their own verification
CREATE POLICY "Employees can view their own RC call log"
  ON public.rc_call_log FOR SELECT
  USING (employee_user_id = auth.uid());
