-- refresh_priority_tiers: re-evaluate priority_tier on all active pending_cases
-- for an agency. Called after every pending cancel upload so cases that have
-- crossed urgency thresholds (P3 → P1/P2 as cancel date approaches, or
-- pending_cancel → cancelled when the policy lapses) get retiered.
--
-- Tier definition:
--   P0 — stage = 'cancelled' (policy already lapsed, coverage gone)
--   P1 — past due OR ≤7 days to cancel AND premium_at_risk ≥ $2,000
--   P2 — past due OR ≤7 days to cancel AND premium_at_risk <  $2,000
--   P3 — more than 7 days until cancel date (not yet urgent)
--
-- $2,000 threshold ≈ $468 in agency commission at ~23.4% blended.

CREATE OR REPLACE FUNCTION public.refresh_priority_tiers(
  p_agency_id uuid,
  p_today     date
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE pending_cases
  SET priority_tier = CASE
    WHEN stage = 'cancelled'
      THEN 'P0'
    WHEN cancel_effective_date IS NOT NULL
         AND (p_today >= cancel_effective_date
              OR (cancel_effective_date - p_today) <= 7)
         AND COALESCE(premium_at_risk, 0) >= 2000
      THEN 'P1'
    WHEN cancel_effective_date IS NOT NULL
         AND (p_today >= cancel_effective_date
              OR (cancel_effective_date - p_today) <= 7)
         AND COALESCE(premium_at_risk, 0) <  2000
      THEN 'P2'
    ELSE 'P3'
  END
  WHERE agency_id = p_agency_id
    AND status NOT IN (
      'saved','lost','auto_resolved',
      'cancelled','requested_cancellation','rewritten'
    );
$$;

GRANT EXECUTE ON FUNCTION public.refresh_priority_tiers(uuid, date) TO authenticated;
