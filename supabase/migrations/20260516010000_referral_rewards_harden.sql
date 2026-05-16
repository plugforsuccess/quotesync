-- Follow-up hardening for the referral reward system. Closes two advisor
-- findings introduced by 20260516000000_referral_rewards, bringing these two
-- objects in line with the security pattern the rest of that migration uses.

-- 1. Pin search_path on the display-name helper (was the only referral
--    function with a role-mutable search_path).
CREATE OR REPLACE FUNCTION public.referral_short_name(p_full text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
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

-- 2. The BEFORE INSERT trigger function is SECURITY DEFINER and never needs to
--    be invoked directly over PostgREST. The trigger keeps firing regardless;
--    this only removes the direct RPC surface (matches the REVOKEs already
--    applied to draw_referral_winner / run_monthly_referral_draws).
REVOKE ALL ON FUNCTION public.referral_entries_before_insert()
  FROM PUBLIC, anon, authenticated;
