-- Referral Reward System v2
-- Evolves the free-text entry model (20260516000000_referral_rewards) into a
-- lead-linked, per-product-line, weighted draw with a GA-resident
-- win-eligibility gate and an escalating monthly cash jackpot.
--
-- Model: anyone may refer; entries materialize from real quoted GA leads
-- (one per product line); only GA-resident referrers are eligible to WIN;
-- a single referrer's odds are capped at 10 entries per monthly draw; the
-- jackpot escalates with participation ($1,000 floor, +$20/entry, $5,000
-- ceiling) and resets each month.
--
-- NOTE ON LINE INFERENCE: product lines are inferred from lead intent
-- signals (vehicle_count / owns_home / product_intent / occupancy), not
-- from a confirmed per-line quote record (lead_quotes has no per-line
-- breakdown). This is a deliberate, documented approximation.

-- ── referral_referrers ──────────────────────────────────────────────────────
-- The referrer as a first-class entity: required because the cap, the cash
-- payout, GA win-eligibility, and link/call-in dedup all key off "who
-- referred". No canonical customer table exists, so this is standalone.
CREATE TABLE IF NOT EXISTS public.referral_referrers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  phone text CHECK (phone IS NULL OR length(phone) <= 32),
  email text CHECK (email IS NULL OR length(email) <= 200),
  -- Two-letter state; drives Model-B win-eligibility (GA only).
  state text CHECK (state IS NULL OR state ~ '^[A-Za-z]{2}$'),
  -- Stable code for the share-link path; leads.referral_code resolves here.
  referral_code text CHECK (referral_code IS NULL OR length(referral_code) <= 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, referral_code)
);

CREATE INDEX IF NOT EXISTS idx_referral_referrers_agency
  ON public.referral_referrers (agency_id);

ALTER TABLE public.referral_referrers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members manage referrers"
  ON public.referral_referrers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = referral_referrers.agency_id
        AND am.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = referral_referrers.agency_id
        AND am.status = 'active'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_referrers TO authenticated;

-- ── referral_entries restructure (table is empty — safe) ────────────────────
ALTER TABLE public.referral_entries DROP COLUMN IF EXISTS referrer_name;
ALTER TABLE public.referral_entries DROP COLUMN IF EXISTS referred_customer;

ALTER TABLE public.referral_entries
  ADD COLUMN IF NOT EXISTS referrer_id uuid
    REFERENCES public.referral_referrers(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lead_id uuid
    REFERENCES public.leads(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS product_line text
    CHECK (product_line IS NULL OR product_line IN ('auto', 'home', 'landlord'));

ALTER TABLE public.referral_entries ALTER COLUMN referrer_id SET NOT NULL;

-- One entry per product line per referred lead per period: collapses the
-- share-link and call-in paths so the same lead can't be double-counted.
-- Manual call-in entries with no matched lead are exempt (lead_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_entries_lead_line
  ON public.referral_entries (agency_id, draw_period, lead_id, product_line)
  WHERE lead_id IS NOT NULL;

-- Rewrite the before-insert stamp: drop the gone referrer_name handling;
-- keep server-side draw_period stamping; only default entered_by when the
-- caller is an authenticated user (the materializer runs without one).
CREATE OR REPLACE FUNCTION public.referral_entries_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entered_by IS NULL THEN
    NEW.entered_by := auth.uid();
  END IF;
  IF NEW.draw_period IS NULL OR NEW.draw_period !~ '^\d{4}-\d{2}$' THEN
    NEW.draw_period := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.referral_entries_before_insert()
  FROM PUBLIC, anon, authenticated;

-- ── leads attribution for the call-in path ──────────────────────────────────
-- Share-link path uses the existing leads.referral_code. Call-in path: staff
-- link the lead to a referrer here.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS referred_by_referrer_id uuid
    REFERENCES public.referral_referrers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_referred_by
  ON public.leads (referred_by_referrer_id)
  WHERE referred_by_referrer_id IS NOT NULL;

-- ── jackpot ─────────────────────────────────────────────────────────────────
ALTER TABLE public.referral_draws
  ADD COLUMN IF NOT EXISTS jackpot_cents int NOT NULL DEFAULT 0;

-- $1,000 floor + $20 per qualified entry, capped at $5,000. Returns cents.
CREATE OR REPLACE FUNCTION public.referral_jackpot_cents(p_entries int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT LEAST(5000, 1000 + 20 * GREATEST(coalesce(p_entries, 0), 0)) * 100;
$$;

-- ── entry materialization ───────────────────────────────────────────────────
-- For a GA-resident referred lead with a resolvable referrer, insert one
-- entry per inferred product line. Idempotent via the partial unique index.
CREATE OR REPLACE FUNCTION public.materialize_referral_entries(p_lead_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead   public.leads;
  v_ref    uuid;
  v_period text;
  v_lines  text[] := '{}';
  v_line   text;
  v_n      int := 0;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- The agency only quotes GA risk, so only GA referred leads qualify.
  IF v_lead.state IS NULL OR upper(btrim(v_lead.state)) <> 'GA' THEN
    RETURN 0;
  END IF;

  -- Resolve the referrer: an explicit call-in link wins; otherwise match
  -- the share-link code.
  v_ref := v_lead.referred_by_referrer_id;
  IF v_ref IS NULL AND v_lead.referral_code IS NOT NULL THEN
    SELECT id INTO v_ref
    FROM public.referral_referrers
    WHERE agency_id = v_lead.agency_id
      AND referral_code IS NOT NULL
      AND lower(referral_code) = lower(v_lead.referral_code)
    LIMIT 1;
  END IF;
  IF v_ref IS NULL THEN
    RETURN 0;
  END IF;

  v_period := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');

  -- Infer quoted lines from lead intent signals (see header note).
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
    v_lines := ARRAY['auto'];  -- conservative fallback: at least one entry
  END IF;

  FOREACH v_line IN ARRAY v_lines LOOP
    INSERT INTO public.referral_entries
      (agency_id, referrer_id, lead_id, product_line, draw_period)
    VALUES
      (v_lead.agency_id, v_ref, v_lead.id, v_line, v_period)
    ON CONFLICT (agency_id, draw_period, lead_id, product_line)
      WHERE lead_id IS NOT NULL
      DO NOTHING;
    IF FOUND THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_referral_entries(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_leads_referral_materialize()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('quoted', 'advanced', 'closed_won')
     AND (
       TG_OP = 'INSERT'
       OR OLD.status IS DISTINCT FROM NEW.status
       OR OLD.referred_by_referrer_id IS DISTINCT FROM NEW.referred_by_referrer_id
     ) THEN
    PERFORM public.materialize_referral_entries(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_referral_materialize ON public.leads;
CREATE TRIGGER trg_leads_referral_materialize
  AFTER INSERT OR UPDATE OF status, referred_by_referrer_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_leads_referral_materialize();

-- ── weighted, GA-eligible, capped draw + jackpot ────────────────────────────
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
    RETURN v_existing;  -- already drawn — never re-roll
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

  -- Capped, GA-eligible pool: each GA-resident referrer contributes at most
  -- 10 entries; a uniform random pick over that pool makes a referrer's odds
  -- scale with their (capped) entry count.
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
    -- Entries exist but none from a GA-resident referrer → no eligible winner.
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
    (agency_id, draw_period, status, winner_entry_id, winner_display_name,
     entry_count, jackpot_cents, drawn_at)
  VALUES
    (p_agency_id, p_period, 'drawn', v_winner_eid, v_display,
     v_total, v_jackpot, now())
  ON CONFLICT (agency_id, draw_period)
  DO UPDATE SET status = 'drawn',
                winner_entry_id = EXCLUDED.winner_entry_id,
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

-- ── public read RPC: add live + awarded jackpot ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_giveaway(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency      record;
  v_current     text := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');
  v_month_start timestamp := date_trunc('month', (now() AT TIME ZONE 'America/New_York'));
  v_period_ends timestamptz;
  v_open_count  int;
  v_last        record;
BEGIN
  SELECT id, brand_name, slug
    INTO v_agency
  FROM public.agencies
  WHERE status = 'approved'
    AND ( (p_slug IS NOT NULL AND slug = p_slug)
       OR (p_slug IS NULL AND is_default = true) )
  LIMIT 1;

  IF v_agency.id IS NULL THEN
    RETURN jsonb_build_object('error', 'agency_not_found');
  END IF;

  v_period_ends := (v_month_start + interval '1 month') AT TIME ZONE 'America/New_York';

  SELECT count(*) INTO v_open_count
  FROM public.referral_entries
  WHERE agency_id = v_agency.id AND draw_period = v_current;

  SELECT draw_period, winner_display_name, entry_count, jackpot_cents, drawn_at
    INTO v_last
  FROM public.referral_draws
  WHERE agency_id = v_agency.id AND status = 'drawn'
  ORDER BY draw_period DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'agency', jsonb_build_object('brand_name', v_agency.brand_name, 'slug', v_agency.slug),
    'current_period', v_current,
    'current_entry_count', v_open_count,
    'current_jackpot_cents', public.referral_jackpot_cents(v_open_count),
    'jackpot_floor_cents', 100000,
    'jackpot_ceiling_cents', 500000,
    'period_ends_at', v_period_ends,
    'last_winner',
      CASE WHEN v_last.draw_period IS NULL THEN NULL
           ELSE jsonb_build_object(
             'period', v_last.draw_period,
             'display_name', v_last.winner_display_name,
             'entry_count', v_last.entry_count,
             'jackpot_cents', v_last.jackpot_cents,
             'drawn_at', v_last.drawn_at
           )
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_giveaway(text) TO anon, authenticated;
