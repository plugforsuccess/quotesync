-- Allow agency principals and managers to read and update employees in their agency.
-- This enables the Team page edit functionality for non-platform-admin users.

-- SELECT: principals and managers can view all employees in their agency
CREATE POLICY "Agency principals can view agency employees"
  ON public.employees FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = employees.org_id
        AND am.status = 'active'
        AND am.agency_role IN ('principal', 'manager')
    )
  );

-- UPDATE: principals and managers can update employees in their agency
CREATE POLICY "Agency principals can update agency employees"
  ON public.employees FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = employees.org_id
        AND am.status = 'active'
        AND am.agency_role IN ('principal', 'manager')
    )
  );
