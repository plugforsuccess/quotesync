-- Referral Rewards v5 — self-report eligibility, draw notifications, ops view
--  #4: capture/backfill the referrer's state from the self-report path so
--      self-reported GA referrers can actually win.
--  notify: alert active agency members when a monthly draw completes.
--  ops: a membership-checked metrics RPC for monitoring before scaling.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referred_by_state text;

-- Materializer: same as v4, plus — on the self-report branch — stamp the
-- referrer's state from leads.referred_by_state (set on create, backfill
-- when an existing referrer has no state yet).
CREATE OR REPLACE FUNCTION public.materialize_referral_entries(p_lead_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead     public.leads;
  v_ref      uuid;
  v_period   text;
  v_qs       jsonb;
  v_ptypes   jsonb;
  v_pt       text;
  v_lines    text[] := '{}';
  v_line     text;
  v_src      text := 'inferred';
  v_n        int := 0;
  v_nm       text;
  v_ph       text;
  v_st       text;
  v_rphone   text;
  v_remail   text;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF v_lead.state IS NULL OR upper(btrim(v_lead.state)) <> 'GA' THEN
    RETURN 0;
  END IF;

  -- Normalize a self-reported referrer state (2 letters or NULL).
  v_st := nullif(upper(btrim(coalesce(v_lead.referred_by_state, ''))), '');
  IF v_st IS NOT NULL AND v_st !~ '^[A-Z]{2}$' THEN
    v_st := NULL;
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

  IF v_ref IS NULL
     AND v_lead.referred_by_name IS NOT NULL
     AND btrim(v_lead.referred_by_name) <> '' THEN
    v_nm := lower(btrim(regexp_replace(v_lead.referred_by_name, '\s+', ' ', 'g')));
    v_ph := nullif(btrim(coalesce(v_lead.referred_by_phone, '')), '');
    SELECT id INTO v_ref
    FROM public.referral_referrers
    WHERE agency_id = v_lead.agency_id
      AND name_norm = v_nm
      AND coalesce(phone, '') = coalesce(v_ph, '')
    LIMIT 1;
    IF v_ref IS NULL THEN
      INSERT INTO public.referral_referrers (agency_id, name, phone, state)
      VALUES (v_lead.agency_id, btrim(v_lead.referred_by_name), v_ph, v_st)
      ON CONFLICT (agency_id, name_norm, coalesce(phone, '')) DO NOTHING
      RETURNING id INTO v_ref;
      IF v_ref IS NULL THEN
        SELECT id INTO v_ref
        FROM public.referral_referrers
        WHERE agency_id = v_lead.agency_id
          AND name_norm = v_nm
          AND coalesce(phone, '') = coalesce(v_ph, '')
        LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF v_ref IS NULL THEN RETURN 0; END IF;

  -- Backfill referrer state from a later self-report if not already known.
  IF v_st IS NOT NULL THEN
    UPDATE public.referral_referrers
    SET state = v_st
    WHERE id = v_ref AND state IS NULL;
  END IF;

  SELECT phone, email INTO v_rphone, v_remail
  FROM public.referral_referrers WHERE id = v_ref;
  IF (v_lead.phone IS NOT NULL AND v_rphone IS NOT NULL
        AND regexp_replace(v_lead.phone, '\D', '', 'g')
          = regexp_replace(v_rphone, '\D', '', 'g'))
     OR (v_lead.email IS NOT NULL AND v_remail IS NOT NULL
        AND lower(btrim(v_lead.email)) = lower(btrim(v_remail))) THEN
    RETURN 0;
  END IF;

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

-- ── draw-completion notification (append-only trigger) ──────────────────────
CREATE OR REPLACE FUNCTION public.referral_draw_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'drawn'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'drawn') THEN
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    SELECT am.user_id,
           'referral_draw',
           'Referral giveaway winner drawn',
           coalesce(NEW.winner_display_name, 'A winner')
             || ' won $' || (NEW.jackpot_cents / 100)::text
             || ' for ' || NEW.draw_period || '. Action the payout.',
           jsonb_build_object('draw_id', NEW.id, 'period', NEW.draw_period,
                              'jackpot_cents', NEW.jackpot_cents)
    FROM public.agency_memberships am
    WHERE am.agency_id = NEW.agency_id
      AND am.status = 'active';
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_draw_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_referral_draw_notify ON public.referral_draws;
CREATE TRIGGER trg_referral_draw_notify
  AFTER INSERT OR UPDATE OF status ON public.referral_draws
  FOR EACH ROW EXECUTE FUNCTION public.referral_draw_notify();

-- ── ops metrics RPC (membership-checked) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_ops(p_agency_id uuid, p_period text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_memberships am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = p_agency_id
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not authorized for this agency';
  END IF;

  SELECT jsonb_build_object(
    'period', p_period,
    'entries_total', count(*),
    'entries_quoted', count(*) FILTER (WHERE line_source = 'quoted'),
    'entries_inferred', count(*) FILTER (WHERE line_source = 'inferred'),
    'entries_manual', count(*) FILTER (WHERE lead_id IS NULL),
    'distinct_referrers', count(DISTINCT referrer_id),
    'eligible_referrers', count(DISTINCT referrer_id) FILTER (
      WHERE referrer_id IN (
        SELECT id FROM public.referral_referrers
        WHERE upper(coalesce(state, '')) = 'GA')),
    'current_jackpot_cents', public.referral_jackpot_cents(count(*)::int)
  )
  INTO v
  FROM public.referral_entries
  WHERE agency_id = p_agency_id AND draw_period = p_period;

  SELECT v
    || jsonb_build_object(
         'draw_status', coalesce((
           SELECT status FROM public.referral_draws
           WHERE agency_id = p_agency_id AND draw_period = p_period), 'open'),
         'referrers_missing_state', (
           SELECT count(*) FROM public.referral_referrers r
           WHERE r.agency_id = p_agency_id AND r.state IS NULL
             AND EXISTS (SELECT 1 FROM public.referral_entries e
                         WHERE e.referrer_id = r.id
                           AND e.draw_period = p_period)))
  INTO v;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referral_ops(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referral_ops(uuid, text) TO authenticated;
