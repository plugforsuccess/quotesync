-- Referral Reward System
-- Staff log customer referrals each month. A pg_cron job draws one random
-- winner per agency at the start of the following month. A public page reads
-- the countdown + latest winner via a SECURITY DEFINER RPC (no PII exposed
-- beyond the chosen display name).

-- ── referral_entries ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  referrer_name text NOT NULL CHECK (length(btrim(referrer_name)) BETWEEN 1 AND 120),
  referred_customer text CHECK (referred_customer IS NULL OR length(referred_customer) <= 120),
  note text CHECK (note IS NULL OR length(note) <= 280),
  draw_period text NOT NULL
    DEFAULT to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM')
    CHECK (draw_period ~ '^\d{4}-\d{2}$'),
  entered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_entries_agency_period
  ON public.referral_entries (agency_id, draw_period);

-- Stamp entered_by + draw_period server-side so the client cannot spoof the
-- author or backfill a closed month.
CREATE OR REPLACE FUNCTION public.referral_entries_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.entered_by := auth.uid();
  NEW.draw_period := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');
  NEW.referrer_name := btrim(NEW.referrer_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_entries_before_insert ON public.referral_entries;
CREATE TRIGGER trg_referral_entries_before_insert
  BEFORE INSERT ON public.referral_entries
  FOR EACH ROW EXECUTE FUNCTION public.referral_entries_before_insert();

ALTER TABLE public.referral_entries ENABLE ROW LEVEL SECURITY;

-- Any active member of the agency (principal + all staff: sales & service)
-- can add, view, and remove that agency's referral entries.
CREATE POLICY "agency members manage referral entries"
  ON public.referral_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = referral_entries.agency_id
        AND am.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = referral_entries.agency_id
        AND am.status = 'active'
    )
  );

GRANT SELECT, INSERT, DELETE ON public.referral_entries TO authenticated;

-- ── referral_draws ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.referral_draws (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  draw_period text NOT NULL CHECK (draw_period ~ '^\d{4}-\d{2}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'drawn', 'no_entries')),
  winner_entry_id uuid REFERENCES public.referral_entries(id) ON DELETE SET NULL,
  winner_display_name text,
  entry_count int NOT NULL DEFAULT 0,
  drawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agency_id, draw_period)
);

CREATE INDEX IF NOT EXISTS idx_referral_draws_agency
  ON public.referral_draws (agency_id, draw_period DESC);

ALTER TABLE public.referral_draws ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency members read referral draws"
  ON public.referral_draws
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.agency_id = referral_draws.agency_id
        AND am.status = 'active'
    )
  );

GRANT SELECT ON public.referral_draws TO authenticated;

-- ── Display name helper ─────────────────────────────────────────────────────
-- "Jane D." from "jane  doe". Pure so it can be reused in collision checks.
CREATE OR REPLACE FUNCTION public.referral_short_name(p_full text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean text := btrim(regexp_replace(coalesce(p_full, ''), '\s+', ' ', 'g'));
  v_first text;
  v_rest  text;
BEGIN
  IF v_clean = '' THEN
    RETURN 'A winner';
  END IF;
  v_first := split_part(v_clean, ' ', 1);
  v_rest  := btrim(substr(v_clean, length(v_first) + 1));
  IF v_rest = '' THEN
    RETURN v_first;
  END IF;
  RETURN v_first || ' ' || upper(left(v_rest, 1)) || '.';
END;
$$;

-- ── Draw one winner (idempotent per agency+period) ──────────────────────────
CREATE OR REPLACE FUNCTION public.draw_referral_winner(p_agency_id uuid, p_period text)
RETURNS public.referral_draws
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing   public.referral_draws;
  v_count      int;
  v_winner     public.referral_entries;
  v_display    text;
  v_collisions int;
  v_result     public.referral_draws;
BEGIN
  SELECT * INTO v_existing
  FROM public.referral_draws
  WHERE agency_id = p_agency_id AND draw_period = p_period
  FOR UPDATE;

  IF FOUND AND v_existing.status = 'drawn' THEN
    RETURN v_existing;  -- already drawn — never re-roll
  END IF;

  SELECT count(*) INTO v_count
  FROM public.referral_entries
  WHERE agency_id = p_agency_id AND draw_period = p_period;

  IF v_count = 0 THEN
    INSERT INTO public.referral_draws (agency_id, draw_period, status, entry_count, drawn_at)
    VALUES (p_agency_id, p_period, 'no_entries', 0, now())
    ON CONFLICT (agency_id, draw_period)
    DO UPDATE SET status = 'no_entries', entry_count = 0, drawn_at = now()
    RETURNING * INTO v_result;
    RETURN v_result;
  END IF;

  SELECT * INTO v_winner
  FROM public.referral_entries
  WHERE agency_id = p_agency_id AND draw_period = p_period
  ORDER BY random()
  LIMIT 1;

  v_display := public.referral_short_name(v_winner.referrer_name);

  -- If >1 distinct full name collapses to this short form, the short name is
  -- ambiguous on the public page — fall back to the winner's full name.
  SELECT count(DISTINCT lower(btrim(regexp_replace(referrer_name, '\s+', ' ', 'g'))))
    INTO v_collisions
  FROM public.referral_entries
  WHERE agency_id = p_agency_id AND draw_period = p_period
    AND public.referral_short_name(referrer_name) = v_display;

  IF v_collisions > 1 THEN
    v_display := btrim(regexp_replace(v_winner.referrer_name, '\s+', ' ', 'g'));
  END IF;

  INSERT INTO public.referral_draws
    (agency_id, draw_period, status, winner_entry_id, winner_display_name, entry_count, drawn_at)
  VALUES
    (p_agency_id, p_period, 'drawn', v_winner.id, v_display, v_count, now())
  ON CONFLICT (agency_id, draw_period)
  DO UPDATE SET status = 'drawn',
                winner_entry_id = EXCLUDED.winner_entry_id,
                winner_display_name = EXCLUDED.winner_display_name,
                entry_count = EXCLUDED.entry_count,
                drawn_at = now()
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.draw_referral_winner(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── Monthly runner (called by pg_cron) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.run_monthly_referral_draws()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Runs early on the 1st; "yesterday" in ET is the month that just closed.
  v_period text := to_char(
    (now() AT TIME ZONE 'America/New_York') - interval '1 day', 'YYYY-MM');
  v_agency uuid;
  v_n int := 0;
BEGIN
  FOR v_agency IN
    SELECT DISTINCT e.agency_id
    FROM public.referral_entries e
    WHERE e.draw_period = v_period
      AND NOT EXISTS (
        SELECT 1 FROM public.referral_draws d
        WHERE d.agency_id = e.agency_id
          AND d.draw_period = v_period
          AND d.status = 'drawn'
      )
  LOOP
    PERFORM public.draw_referral_winner(v_agency, v_period);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.run_monthly_referral_draws() FROM PUBLIC, anon, authenticated;

-- ── Public read RPC (powers the no-auth /giveaway page) ─────────────────────
CREATE OR REPLACE FUNCTION public.get_referral_giveaway(p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency        record;
  v_current       text := to_char((now() AT TIME ZONE 'America/New_York'), 'YYYY-MM');
  v_month_start   timestamp := date_trunc('month', (now() AT TIME ZONE 'America/New_York'));
  v_period_ends   timestamptz;
  v_open_count    int;
  v_last          record;
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

  SELECT draw_period, status, winner_display_name, entry_count, drawn_at
    INTO v_last
  FROM public.referral_draws
  WHERE agency_id = v_agency.id AND status = 'drawn'
  ORDER BY draw_period DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'agency', jsonb_build_object('brand_name', v_agency.brand_name, 'slug', v_agency.slug),
    'current_period', v_current,
    'current_entry_count', v_open_count,
    'period_ends_at', v_period_ends,
    'last_winner',
      CASE WHEN v_last.draw_period IS NULL THEN NULL
           ELSE jsonb_build_object(
             'period', v_last.draw_period,
             'display_name', v_last.winner_display_name,
             'entry_count', v_last.entry_count,
             'drawn_at', v_last.drawn_at
           )
      END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_referral_giveaway(text) TO anon, authenticated;

-- ── Schedule the monthly draw (idempotent; no-op if pg_cron absent) ─────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'referral-monthly-draw') THEN
      PERFORM cron.unschedule('referral-monthly-draw');
    END IF;
    -- 06:30 UTC on the 1st of each month (~01:30/02:30 ET) — safely past
    -- the ET month boundary so the previous month is the target period.
    PERFORM cron.schedule(
      'referral-monthly-draw',
      '30 6 1 * *',
      $cron$ SELECT public.run_monthly_referral_draws(); $cron$
    );
  END IF;
END
$$;
