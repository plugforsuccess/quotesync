-- ============================================================================
-- Retention elasticity views (PR-3) — the durable, proprietary asset
-- ============================================================================
-- Answers the question that prices the product: "when we raise a customer's
-- premium by X%, what share of the book leaves — and how much does a save
-- intervention change that?"
--
-- Reads renewal_cases. Prefers the clean `final_outcome` label; falls back to
-- workflow `status` so the curve is populated before final_outcome is fully
-- backfilled. WITH (security_invoker = true) so per-agency RLS on the
-- underlying tables still applies — each tenant sees only its own curve.
--
-- Longitudinal note: each renewal cycle persists as its own renewal_cases row
-- (unique on agency_id, policy_no, renewal_date), so this curve sharpens every
-- year as more cycles accumulate. It is a snapshot today, a moat over time.
-- ============================================================================

-- Shared outcome + bucket logic, expressed once per view (Postgres views can't
-- share CTEs across definitions; kept identical for consistency).

CREATE OR REPLACE VIEW public.renewal_elasticity_curve
WITH (security_invoker = true) AS
WITH resolved AS (
  SELECT
    rc.agency_id,
    rc.premium_change_pct,
    CASE
      WHEN rc.final_outcome = 'renewed' THEN 1
      WHEN rc.final_outcome = 'lost'    THEN 0
      WHEN rc.final_outcome IS NULL AND rc.status IN ('confirmed','auto_resolved') THEN 1
      WHEN rc.final_outcome IS NULL AND rc.status = 'lost' THEN 0
      ELSE NULL
    END AS retained
  FROM public.renewal_cases rc
  WHERE rc.premium_change_pct IS NOT NULL
),
bucketed AS (
  SELECT
    agency_id, retained,
    CASE
      WHEN premium_change_pct < 0  THEN 0
      WHEN premium_change_pct < 5  THEN 1
      WHEN premium_change_pct < 10 THEN 2
      WHEN premium_change_pct < 15 THEN 3
      WHEN premium_change_pct < 20 THEN 4
      ELSE 5
    END AS bucket_order
  FROM resolved
  WHERE retained IS NOT NULL
)
SELECT
  agency_id,
  bucket_order,
  CASE bucket_order
    WHEN 0 THEN 'Decrease' WHEN 1 THEN '0-5%'  WHEN 2 THEN '5-10%'
    WHEN 3 THEN '10-15%'   WHEN 4 THEN '15-20%' ELSE '20%+'
  END AS change_bucket,
  count(*)                              AS policies_resolved,
  count(*) FILTER (WHERE retained = 1)  AS retained,
  count(*) FILTER (WHERE retained = 0)  AS lost,
  round(100.0 * count(*) FILTER (WHERE retained = 1) / count(*), 1) AS retention_rate_pct
FROM bucketed
GROUP BY agency_id, bucket_order;

GRANT SELECT ON public.renewal_elasticity_curve TO authenticated;

-- The lift view: same curve, split by whether a save intervention was logged.
-- Once renewal_attempts fill post-launch, this is the literal ROI proof —
-- "at +15% retention is N% with a save call vs M% without."
CREATE OR REPLACE VIEW public.renewal_elasticity_by_intervention
WITH (security_invoker = true) AS
WITH resolved AS (
  SELECT
    rc.id, rc.agency_id, rc.premium_change_pct,
    CASE
      WHEN rc.final_outcome = 'renewed' THEN 1
      WHEN rc.final_outcome = 'lost'    THEN 0
      WHEN rc.final_outcome IS NULL AND rc.status IN ('confirmed','auto_resolved') THEN 1
      WHEN rc.final_outcome IS NULL AND rc.status = 'lost' THEN 0
      ELSE NULL
    END AS retained,
    EXISTS (
      SELECT 1 FROM public.renewal_attempts ra
      WHERE ra.renewal_case_id = rc.id
        AND ra.interventions IS NOT NULL
        AND array_length(ra.interventions, 1) > 0
    ) AS had_intervention
  FROM public.renewal_cases rc
  WHERE rc.premium_change_pct IS NOT NULL
)
SELECT
  agency_id,
  CASE
    WHEN premium_change_pct < 0  THEN 0 WHEN premium_change_pct < 5  THEN 1
    WHEN premium_change_pct < 10 THEN 2 WHEN premium_change_pct < 15 THEN 3
    WHEN premium_change_pct < 20 THEN 4 ELSE 5
  END AS bucket_order,
  had_intervention,
  count(*)                              AS policies_resolved,
  count(*) FILTER (WHERE retained = 1)  AS retained,
  round(100.0 * count(*) FILTER (WHERE retained = 1) / NULLIF(count(*),0), 1) AS retention_rate_pct
FROM resolved
WHERE retained IS NOT NULL
GROUP BY agency_id, bucket_order, had_intervention;

GRANT SELECT ON public.renewal_elasticity_by_intervention TO authenticated;
