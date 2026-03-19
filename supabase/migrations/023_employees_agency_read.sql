-- Allow agency agent to read all employees in their agency
CREATE POLICY "Agency agent can read own agency employees"
  ON public.employees FOR SELECT
  USING (
    org_id IN (
      SELECT am.agency_id FROM agency_memberships am
      WHERE am.user_id = auth.uid()
      AND am.status = 'active'
      AND am.agency_role = 'agent'
    )
  );

-- Allow producers to read colleagues in their agency
CREATE POLICY "Agency producer can read own agency employees"
  ON public.employees FOR SELECT
  USING (
    org_id IN (
      SELECT am.agency_id FROM agency_memberships am
      WHERE am.user_id = auth.uid()
      AND am.status = 'active'
      AND am.agency_role = 'producer'
    )
  );
