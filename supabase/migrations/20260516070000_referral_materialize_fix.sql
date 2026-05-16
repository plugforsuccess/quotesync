-- Critical fix for 20260516050000: `text[] || text` was interpreted as
-- array-concat and raised "malformed array literal", breaking the
-- materializer (and therefore lead_quotes inserts / lead status updates
-- that trigger it). Use array_append, otherwise identical to v3.

CREATE OR REPLACE FUNCTION public.materialize_referral_entries(p_lead_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead    public.leads;
  v_ref     uuid;
  v_period  text;
  v_qs      jsonb;
  v_ptypes  jsonb;
  v_pt      text;
  v_lines   text[] := '{}';
  v_line    text;
  v_src     text := 'inferred';
  v_n       int := 0;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_lead.state IS NULL OR upper(btrim(v_lead.state)) <> 'GA' THEN
    RETURN 0;
  END IF;

  v_ref := v_lead.referred_by_referrer_id;
  IF v_ref IS NULL AND v_lead.referral_code IS NOT NULL THEN
    SELECT id INTO v_ref
    FROM public.referral_referrers
    WHERE agency_id = v_lead.agency_id
      AND referral_code IS NOT NULL
      AND lower(referral_code) = lower(v_lead.referral_code)
    LIMIT 1;
  END IF;
  IF v_ref IS NULL THEN RETURN 0; END IF;

  v_period := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');

  SELECT quote_summary INTO v_qs
  FROM public.lead_quotes
  WHERE lead_id = p_lead_id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_qs IS NOT NULL THEN
    v_src := 'quoted';
    v_ptypes := v_qs -> 'policy_types';
    IF jsonb_typeof(v_ptypes) = 'array' THEN
      FOR v_pt IN SELECT lower(jsonb_array_elements_text(v_ptypes)) LOOP
        IF v_pt LIKE '%auto%' OR v_pt LIKE '%vehicle%' OR v_pt LIKE '%car%' THEN
          v_lines := array_append(v_lines, 'auto');
        ELSIF v_pt LIKE '%landlord%' OR v_pt LIKE '%dwelling%'
              OR v_pt LIKE '%rental%' OR v_pt LIKE '%dp3%' OR v_pt LIKE '%dp-3%' THEN
          v_lines := array_append(v_lines, 'landlord');
        ELSIF v_pt LIKE '%home%' OR v_pt LIKE '%homeowner%'
              OR v_pt LIKE '%ho3%' OR v_pt LIKE '%ho-3%'
              OR v_pt LIKE '%renter%' OR v_pt LIKE '%property%' THEN
          v_lines := array_append(v_lines, 'home');
        END IF;
      END LOOP;
    END IF;
    SELECT array_agg(DISTINCT x) INTO v_lines FROM unnest(v_lines) x;
    IF v_lines IS NULL OR array_length(v_lines, 1) IS NULL THEN
      v_lines := ARRAY['other'];
    END IF;
  ELSE
    IF v_lead.product_intent = 'landlord' OR v_lead.home_occupancy_type = 'rental' THEN
      v_lines := array_append(v_lines, 'landlord');
    END IF;
    IF coalesce(v_lead.vehicle_count, 0) >= 1
       OR v_lead.product_intent IN ('auto', 'bundle') THEN
      v_lines := array_append(v_lines, 'auto');
    END IF;
    IF v_lead.owns_home IS TRUE OR v_lead.has_primary_home IS TRUE
       OR v_lead.product_intent IN ('home', 'bundle') THEN
      v_lines := array_append(v_lines, 'home');
    END IF;
    IF array_length(v_lines, 1) IS NULL THEN
      RETURN 0;
    END IF;
  END IF;

  FOREACH v_line IN ARRAY v_lines LOOP
    INSERT INTO public.referral_entries
      (agency_id, referrer_id, lead_id, product_line, draw_period, line_source)
    VALUES
      (v_lead.agency_id, v_ref, v_lead.id, v_line, v_period, v_src)
    ON CONFLICT (agency_id, draw_period, lead_id, product_line)
      WHERE lead_id IS NOT NULL
      DO NOTHING;
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_referral_entries(uuid)
  FROM PUBLIC, anon, authenticated;
