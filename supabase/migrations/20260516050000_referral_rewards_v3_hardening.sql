-- Referral Rewards v3 — gap hardening
-- Addresses: (1) quote-accurate line derivation, (4) referrer dedup,
-- (6) winner payout/tax tracking, (7) abuse controls + audit trail.
-- (Gaps 2/3/5 are frontend/route work in the same change set.)

-- ── gap 1: line_source + 'other' line, quote-accurate derivation ────────────
ALTER TABLE public.referral_entries
  ADD COLUMN IF NOT EXISTS line_source text NOT NULL DEFAULT 'inferred'
    CHECK (line_source IN ('quoted', 'inferred'));

ALTER TABLE public.referral_entries
  DROP CONSTRAINT IF EXISTS referral_entries_product_line_check;
ALTER TABLE public.referral_entries
  ADD CONSTRAINT referral_entries_product_line_chk
  CHECK (product_line IS NULL OR product_line IN ('auto','home','landlord','other'));

-- ── gap 4: referrer identity normalization + dedup ──────────────────────────
ALTER TABLE public.referral_referrers
  ADD COLUMN IF NOT EXISTS name_norm text
    GENERATED ALWAYS AS (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_referrers_identity
  ON public.referral_referrers (agency_id, name_norm, coalesce(phone, ''));

-- Short, reasonably unique share code (gap 3 support).
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;
GRANT EXECUTE ON FUNCTION public.gen_referral_code() TO authenticated;

-- ── gap 6: payout / tax tracking ────────────────────────────────────────────
ALTER TABLE public.referral_draws
  ADD COLUMN IF NOT EXISTS winner_referrer_id uuid
    REFERENCES public.referral_referrers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'pending'
    CHECK (payout_status IN ('pending', 'paid', 'void')),
  ADD COLUMN IF NOT EXISTS payout_method text
    CHECK (payout_method IS NULL OR payout_method IN ('zelle', 'ach')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_doc_received boolean NOT NULL DEFAULT false;

-- ── gap 1: quote-accurate materialization (no phantom fallback) ─────────────
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

  -- Referred lead must be a Georgia resident (only GA risk is quotable).
  IF v_lead.state IS NULL OR upper(btrim(v_lead.state)) <> 'GA' THEN
    RETURN 0;
  END IF;

  -- Resolve referrer: explicit call-in link wins; else share-link code.
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

  -- Prefer the real quote's policy_types (authoritative); fall back to lead
  -- intent only when no quote record exists.
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
          v_lines := v_lines || 'auto';
        ELSIF v_pt LIKE '%landlord%' OR v_pt LIKE '%dwelling%'
              OR v_pt LIKE '%rental%' OR v_pt LIKE '%dp3%' OR v_pt LIKE '%dp-3%' THEN
          v_lines := v_lines || 'landlord';
        ELSIF v_pt LIKE '%home%' OR v_pt LIKE '%homeowner%'
              OR v_pt LIKE '%ho3%' OR v_pt LIKE '%ho-3%'
              OR v_pt LIKE '%renter%' OR v_pt LIKE '%property%' THEN
          v_lines := v_lines || 'home';
        END IF;
      END LOOP;
    END IF;
    SELECT array_agg(DISTINCT x) INTO v_lines FROM unnest(v_lines) x;
    -- Quote exists but no recognizable line → one honest 'other' entry.
    IF v_lines IS NULL OR array_length(v_lines, 1) IS NULL THEN
      v_lines := ARRAY['other'];
    END IF;
  ELSE
    -- No quote record: infer from lead intent. NO phantom fallback — a lead
    -- with zero product signal produces zero entries.
    IF v_lead.product_intent = 'landlord' OR v_lead.home_occupancy_type = 'rental' THEN
      v_lines := v_lines || 'landlord';
    END IF;
    IF coalesce(v_lead.vehicle_count, 0) >= 1
       OR v_lead.product_intent IN ('auto', 'bundle') THEN
      v_lines := v_lines || 'auto';
    END IF;
    IF v_lead.owns_home IS TRUE OR v_lead.has_primary_home IS TRUE
       OR v_lead.product_intent IN ('home', 'bundle') THEN
      v_lines := v_lines || 'home';
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

-- ── gap 6: record the winning referrer on the draw ──────────────────────────
CREATE OR REPLACE FUNCTION public.draw_referral_winner(p_agency_id uuid, p_period text)
RETURNS public.referral_draws
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing   public.referral_draws;
  v_total      int;
  v_jackpot    int;
  v_winner_ref uuid;
  v_winner_eid uuid;
  v_display    text;
  v_result     public.referral_draws;
BEGIN
  SELECT * INTO v_existing
  FROM public.referral_draws
  WHERE agency_id = p_agency_id AND draw_period = p_period
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'drawn' THEN
    RETURN v_existing;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.referral_entries
  WHERE agency_id = p_agency_id AND draw_period = p_period;

  v_jackpot := public.referral_jackpot_cents(v_total);

  IF v_total = 0 THEN
    INSERT INTO public.referral_draws
      (agency_id, draw_period, status, entry_count, jackpot_cents, drawn_at)
    VALUES (p_agency_id, p_period, 'no_entries', 0, v_jackpot, now())
    ON CONFLICT (agency_id, draw_period)
    DO UPDATE SET status = 'no_entries', entry_count = 0,
                  jackpot_cents = EXCLUDED.jackpot_cents, drawn_at = now()
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  WITH eligible AS (
    SELECT e.id AS entry_id, e.referrer_id,
           row_number() OVER (
             PARTITION BY e.referrer_id ORDER BY e.created_at, e.id
           ) AS rn
    FROM public.referral_entries e
    JOIN public.referral_referrers r ON r.id = e.referrer_id
    WHERE e.agency_id = p_agency_id
      AND e.draw_period = p_period
      AND r.state IS NOT NULL
      AND upper(btrim(r.state)) = 'GA'
  )
  SELECT entry_id, referrer_id INTO v_winner_eid, v_winner_ref
  FROM eligible
  WHERE rn <= 10
  ORDER BY random()
  LIMIT 1;

  IF v_winner_ref IS NULL THEN
    INSERT INTO public.referral_draws
      (agency_id, draw_period, status, entry_count, jackpot_cents, drawn_at)
    VALUES (p_agency_id, p_period, 'no_entries', v_total, v_jackpot, now())
    ON CONFLICT (agency_id, draw_period)
    DO UPDATE SET status = 'no_entries', entry_count = v_total,
                  jackpot_cents = EXCLUDED.jackpot_cents, drawn_at = now()
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  SELECT public.referral_short_name(name) INTO v_display
  FROM public.referral_referrers WHERE id = v_winner_ref;

  INSERT INTO public.referral_draws
    (agency_id, draw_period, status, winner_entry_id, winner_referrer_id,
     winner_display_name, entry_count, jackpot_cents, drawn_at)
  VALUES
    (p_agency_id, p_period, 'drawn', v_winner_eid, v_winner_ref,
     v_display, v_total, v_jackpot, now())
  ON CONFLICT (agency_id, draw_period)
  DO UPDATE SET status = 'drawn',
                winner_entry_id = EXCLUDED.winner_entry_id,
                winner_referrer_id = EXCLUDED.winner_referrer_id,
                winner_display_name = EXCLUDED.winner_display_name,
                entry_count = EXCLUDED.entry_count,
                jackpot_cents = EXCLUDED.jackpot_cents,
                drawn_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.draw_referral_winner(uuid, text)
  FROM PUBLIC, anon, authenticated;

-- ── gap 6: staff-authorized payout update RPC ───────────────────────────────
CREATE OR REPLACE FUNCTION public.set_referral_payout(
  p_draw_id uuid, p_status text, p_method text DEFAULT NULL,
  p_tax_doc boolean DEFAULT NULL)
RETURNS public.referral_draws
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draw public.referral_draws;
BEGIN
  IF p_status NOT IN ('pending', 'paid', 'void') THEN
    RAISE EXCEPTION 'invalid payout status: %', p_status;
  END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('zelle', 'ach') THEN
    RAISE EXCEPTION 'invalid payout method: %', p_method;
  END IF;

  SELECT * INTO v_draw FROM public.referral_draws WHERE id = p_draw_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'draw not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agency_memberships am
    WHERE am.user_id = auth.uid()
      AND am.agency_id = v_draw.agency_id
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'not authorized for this agency';
  END IF;

  UPDATE public.referral_draws
  SET payout_status = p_status,
      payout_method = coalesce(p_method, payout_method),
      tax_doc_received = coalesce(p_tax_doc, tax_doc_received),
      paid_at = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = p_draw_id
  RETURNING * INTO v_draw;

  INSERT INTO public.audit_log (event_type, agency_id, actor_user_id, metadata)
  VALUES ('REFERRAL_PAYOUT_UPDATED', v_draw.agency_id, auth.uid(),
          jsonb_build_object('draw_id', p_draw_id, 'status', p_status,
                             'method', p_method));

  RETURN v_draw;
END;
$$;

REVOKE ALL ON FUNCTION public.set_referral_payout(uuid, text, text, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_referral_payout(uuid, text, text, boolean)
  TO authenticated;

-- ── gap 7: tamper protection + audit trail ──────────────────────────────────
-- Block deleting entries once that month's draw is finalized.
CREATE OR REPLACE FUNCTION public.referral_entries_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.referral_draws d
    WHERE d.agency_id = OLD.agency_id
      AND d.draw_period = OLD.draw_period
      AND d.status = 'drawn'
  ) THEN
    RAISE EXCEPTION 'cannot remove entries from a period whose draw is final';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_entries_before_delete ON public.referral_entries;
CREATE TRIGGER trg_referral_entries_before_delete
  BEFORE DELETE ON public.referral_entries
  FOR EACH ROW EXECUTE FUNCTION public.referral_entries_before_delete();

CREATE OR REPLACE FUNCTION public.referral_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'referral_referrers' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, agency_id, actor_user_id, metadata)
    VALUES ('REFERRAL_REFERRER_CREATED', NEW.agency_id, auth.uid(),
            jsonb_build_object('referrer_id', NEW.id, 'name', NEW.name,
                               'state', NEW.state));
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'referral_entries' AND TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (event_type, agency_id, lead_id, actor_user_id, metadata)
    VALUES ('REFERRAL_ENTRY_ADDED', NEW.agency_id, NEW.lead_id, auth.uid(),
            jsonb_build_object('entry_id', NEW.id, 'referrer_id', NEW.referrer_id,
                               'product_line', NEW.product_line,
                               'line_source', NEW.line_source,
                               'manual', NEW.lead_id IS NULL));
    RETURN NEW;
  ELSIF TG_TABLE_NAME = 'referral_entries' AND TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (event_type, agency_id, lead_id, actor_user_id, metadata)
    VALUES ('REFERRAL_ENTRY_REMOVED', OLD.agency_id, OLD.lead_id, auth.uid(),
            jsonb_build_object('entry_id', OLD.id, 'referrer_id', OLD.referrer_id,
                               'product_line', OLD.product_line));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_referral_referrers_audit ON public.referral_referrers;
CREATE TRIGGER trg_referral_referrers_audit
  AFTER INSERT ON public.referral_referrers
  FOR EACH ROW EXECUTE FUNCTION public.referral_audit();

DROP TRIGGER IF EXISTS trg_referral_entries_audit_ins ON public.referral_entries;
CREATE TRIGGER trg_referral_entries_audit_ins
  AFTER INSERT ON public.referral_entries
  FOR EACH ROW EXECUTE FUNCTION public.referral_audit();

DROP TRIGGER IF EXISTS trg_referral_entries_audit_del ON public.referral_entries;
CREATE TRIGGER trg_referral_entries_audit_del
  AFTER DELETE ON public.referral_entries
  FOR EACH ROW EXECUTE FUNCTION public.referral_audit();
