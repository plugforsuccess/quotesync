-- Daily priority-tier refresh.
--
-- refresh_priority_tiers() was only ever called on pending-cancel upload, so
-- between uploads a case's stored priority_tier goes stale: a case that was
-- ">7 days out" (P3) when last uploaded stays tagged P3 after it crosses its
-- cancel date, even though it's now past due. Today's Focus and My Queue both
-- rank/bucket off that stored column, so those past-due cases sink to the
-- bottom (P3) instead of surfacing as the most urgent (P1/P2).
--
-- Fix: an all-agency variant plus a daily pg_cron job so tiers stay correct
-- without waiting for the next upload. Also runs once now to correct any
-- currently-stale rows.
--
-- Tier definition (identical to refresh_priority_tiers):
--   P0 — stage = 'cancelled' (already lapsed)
--   P1 — past due OR ≤7 days to cancel AND premium_at_risk ≥ $2,000
--   P2 — past due OR ≤7 days to cancel AND premium_at_risk <  $2,000
--   P3 — more than 7 days until cancel date (not yet urgent)

CREATE OR REPLACE FUNCTION public.refresh_priority_tiers_all(
  p_today date DEFAULT current_date
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
  WHERE status NOT IN (
    'saved','lost','auto_resolved',
    'cancelled','requested_cancellation','rewritten'
  );
$$;

GRANT EXECUTE ON FUNCTION public.refresh_priority_tiers_all(date) TO authenticated;

-- Schedule a daily retier at 11:00 UTC (~6–7am US/Eastern), before the workday.
-- cron.schedule upserts by job name, so re-running this migration is idempotent.
SELECT cron.schedule(
  'refresh-priority-tiers-daily',
  '0 11 * * *',
  $$ SELECT public.refresh_priority_tiers_all(); $$
);

-- Correct any rows that are already stale (e.g. past-due cases still tagged P3).
SELECT public.refresh_priority_tiers_all();
