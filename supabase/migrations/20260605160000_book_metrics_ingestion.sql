-- ============================================================================
-- Book Metrics Ingestion — the foundation of the ingestion + join engine
-- ============================================================================
-- Allstate hands the agency monthly book-health reports. Each download is a
-- point-in-time view; the durable asset is the LONGITUDINAL series you get by
-- stacking snapshots over time — which a downloaded spreadsheet can't give you.
--
-- This migration lands the two keystone reports:
--   1. book_snapshots         — Premium & Profitability   (product × month)  → the scoreboard
--   2. policy_audit_snapshots — Policy Audit              (policy  × month)  → the per-policy census
--
-- Grain matters: book_snapshots answers "what % of the book did we retain"
-- (the denominator + Allstate's own computed retention, with prior-year
-- baseline and tenure bands). policy_audit_snapshots answers "which specific
-- policies stayed in force" — the OBSERVED outcome that replaces the inferred
-- easy_pay heuristic and, joined to renewal premium-change + intervention,
-- builds the retention-elasticity model.
--
-- Both reconcile: per-policy rows sum to the product-level scoreboard.
-- Other reports (Item Portfolio Growth, Loss Detail, Commission) follow the
-- same pattern in later migrations.
-- ============================================================================

-- ─── upload audit (shared across book-metric report types) ───────────────────
CREATE TABLE IF NOT EXISTS public.book_metric_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  report_type     TEXT NOT NULL CHECK (report_type IN (
                    'premium_profitability', 'policy_audit',
                    'portfolio_growth', 'loss_detail', 'commission'
                  )),
  production_month DATE,                    -- the report's production month (YYYY-MM-01)
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  filename        TEXT,
  rows_added      INTEGER NOT NULL DEFAULT 0,
  rows_updated    INTEGER NOT NULL DEFAULT 0,
  committed       BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.book_metric_uploads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency members manage book_metric_uploads" ON public.book_metric_uploads;
CREATE POLICY "Agency members manage book_metric_uploads"
  ON public.book_metric_uploads FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM public.agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ─── 1. book_snapshots (Premium & Profitability) ─────────────────────────────
-- One row per (agency, production_month, product). Allstate computes the
-- retention %; we store it plus the PIF census, premium, and loss ratio, and
-- keep the full row in `raw` so no column is ever lost.
CREATE TABLE IF NOT EXISTS public.book_snapshots (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  production_month         DATE NOT NULL,
  product                  TEXT NOT NULL,            -- Allstate product label, e.g. "Standard Auto"
  product_key              TEXT,                     -- normalized: auto | ho | renters | condo | ...

  -- Policies in force (the denominator)
  pif_current              INTEGER,
  pif_pye                  INTEGER,                  -- prior year end
  pif_variance             INTEGER,
  pif_ye_est_growth_pct    NUMERIC(7,2),

  -- Retention (Allstate-computed) — current month + prior-year baseline + tenure
  policy_retention_pct     NUMERIC(6,2),
  net_retention_pct        NUMERIC(6,2),
  retention_py_pct         NUMERIC(6,2),             -- prior-year policy retention (baseline)
  retention_point_variance NUMERIC(6,2),             -- current vs prior-year, in points
  tenure_ret_0_2           NUMERIC(6,2),
  tenure_ret_2_5           NUMERIC(6,2),
  tenure_ret_5plus         NUMERIC(6,2),

  -- Premium + profitability
  written_premium_total    NUMERIC(14,2),            -- current month total ($)
  written_premium_ytd      NUMERIC(14,2),
  loss_ratio_12mm          NUMERIC(7,2),
  loss_ratio_24mm          NUMERIC(7,2),

  raw                      JSONB,                     -- full parsed row, for anything not columned
  upload_batch_id          UUID REFERENCES public.book_metric_uploads(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, production_month, product)
);

CREATE INDEX IF NOT EXISTS book_snapshots_agency_month_idx
  ON public.book_snapshots (agency_id, production_month);

ALTER TABLE public.book_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency members manage book_snapshots" ON public.book_snapshots;
CREATE POLICY "Agency members manage book_snapshots"
  ON public.book_snapshots FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM public.agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ─── 2. policy_audit_snapshots (Policy Audit) ────────────────────────────────
-- One row per (agency, production_month, policy_no). The per-policy in-force
-- census. policy_status + pif_current are the OBSERVED outcome; policy_no is
-- the join key to renewal_cases / pending_cases / lapse_events.
CREATE TABLE IF NOT EXISTS public.policy_audit_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  production_month      DATE NOT NULL,
  policy_no             TEXT NOT NULL,
  policy_status         TEXT,                        -- Active / (Cancelled / Lapsed / ...)
  product               TEXT,
  product_key           TEXT,                        -- normalized
  zip                   TEXT,

  pif_current           INTEGER,                     -- 1 = in force this month
  pif_pye               INTEGER,                     -- 1 = in force prior year end
  retention_numerator   NUMERIC(10,4),
  retention_denominator NUMERIC(10,4),

  written_premium_12mm  NUMERIC(12,2),
  earned_premium_12mm   NUMERIC(12,2),

  raw                   JSONB,
  upload_batch_id       UUID REFERENCES public.book_metric_uploads(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, production_month, policy_no)
);

CREATE INDEX IF NOT EXISTS policy_audit_snapshots_agency_month_idx
  ON public.policy_audit_snapshots (agency_id, production_month);
CREATE INDEX IF NOT EXISTS policy_audit_snapshots_policy_idx
  ON public.policy_audit_snapshots (agency_id, policy_no);

ALTER TABLE public.policy_audit_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Agency members manage policy_audit_snapshots" ON public.policy_audit_snapshots;
CREATE POLICY "Agency members manage policy_audit_snapshots"
  ON public.policy_audit_snapshots FOR ALL
  USING (agency_id IN (
    SELECT am.agency_id FROM public.agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active'
  ));

-- ─── Elasticity foundation view ──────────────────────────────────────────────
-- The join that was previously impossible: per policy, the OBSERVED outcome
-- (still in force?) from the latest audit snapshot, lined up with the rate
-- change we ingested (renewal_cases) and the intervention effort logged
-- against it. This is the seed of the retention-elasticity dataset — the
-- "which interventions save customers, at which rate band" question.
CREATE OR REPLACE VIEW public.policy_elasticity_base AS
WITH latest AS (
  SELECT DISTINCT ON (agency_id, policy_no)
         agency_id, policy_no, production_month, policy_status,
         product_key, zip, pif_current, retention_numerator, retention_denominator,
         written_premium_12mm
  FROM public.policy_audit_snapshots
  ORDER BY agency_id, policy_no, production_month DESC
)
SELECT
  l.agency_id,
  l.policy_no,
  l.production_month        AS audit_month,
  l.policy_status,
  l.product_key,
  l.zip,
  (l.pif_current = 1)       AS in_force,             -- OBSERVED outcome
  l.written_premium_12mm,
  rc.premium_change_pct,                              -- the rate band (from renewal report)
  rc.premium                AS renewal_premium,
  rc.renewal_status,
  rc.attempt_count          AS renewal_attempt_count,
  rc.final_outcome
FROM latest l
LEFT JOIN public.renewal_cases rc
  ON  rc.agency_id = l.agency_id
  AND rc.policy_no = l.policy_no;

GRANT SELECT ON public.policy_elasticity_base TO authenticated;

COMMENT ON VIEW public.policy_elasticity_base IS
  'Per-policy observed in-force outcome (latest Policy Audit snapshot) joined to renewal rate-change + intervention effort. Foundation of the retention-elasticity model.';
