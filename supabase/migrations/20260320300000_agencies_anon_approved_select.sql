-- MT-08 hardening: Allow anon users to read approved agencies by slug
-- The prior policy only allowed is_default = true, blocking ?agency=slug lookups
-- for non-default agencies in the consumer funnel (useFunnelAgency).
--
-- Safe because the funnel hook only selects non-sensitive fields:
-- id, brand_name, email, agent_first_name, site_url, canopy_slug,
-- licensed_states, target_zip_ranges, status, slug

DROP POLICY IF EXISTS "Public view default agency" ON public.agencies;
DROP POLICY IF EXISTS "Anon view default agency" ON public.agencies;

CREATE POLICY "Anon view approved agencies"
  ON public.agencies FOR SELECT
  TO anon
  USING (status = 'approved');
