-- Allow agency principals to update commission_goal and premium_goal
-- on their own agency_carrier_config row.

CREATE POLICY "agency_carrier_config_update_principal" ON public.agency_carrier_config
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_carrier_config.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );
