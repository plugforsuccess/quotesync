-- ============================================================================
-- Producer Compensation Model — Config & Product Mix Tables
-- Stores compensation assumptions for scenario modeling by agency principals.
-- All records scoped to agency_id with RLS policies for agent-only access.
-- ============================================================================

-- ─── 1. producer_comp_configs ─────────────────────────────────────────────────
-- One active config per producer per agency at a time.

CREATE TABLE public.producer_comp_configs (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id                 uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id               uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  carrier_id                uuid REFERENCES agency_carrier_config(id) ON DELETE SET NULL,

  -- Fixed compensation
  base_salary_annual        numeric(10,2) NOT NULL DEFAULT 35000,
  employer_burden_monthly   numeric(8,2)  NOT NULL DEFAULT 279,

  -- VC base comp
  vc_base_comp_pct          numeric(5,4)  NOT NULL DEFAULT 0.05,    -- 5% = 0.05
  vc_commission_rate        numeric(5,4)  NOT NULL DEFAULT 0.234,   -- agency blended commission rate on VC premium

  -- Non-VC bonus (flat monthly estimate)
  non_vc_bonus_monthly      numeric(8,2)  NOT NULL DEFAULT 75,

  -- Top Performer bonus bands (item-count based, marginal)
  tp_band1_threshold        integer       NOT NULL DEFAULT 30,      -- items/month to enter band 1
  tp_band1_addon            numeric(8,2)  NOT NULL DEFAULT 25,      -- $ per marginal item above band1 threshold
  tp_band2_threshold        integer       NOT NULL DEFAULT 36,      -- items/month to enter band 2
  tp_band2_addon            numeric(8,2)  NOT NULL DEFAULT 50,      -- $ per marginal item above band2 threshold

  is_active                 boolean       NOT NULL DEFAULT true,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  updated_at                timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (agency_id, employee_id, is_active)   -- only one active config per producer
);

ALTER TABLE public.producer_comp_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_manages_comp_configs"
  ON public.producer_comp_configs FOR ALL
  USING (
    agency_id IN (
      SELECT am.agency_id FROM agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.status = 'active'
        AND am.agency_role = 'agent'
    )
  );

-- ─── 2. producer_comp_product_mix ─────────────────────────────────────────────
-- Product mix assumptions that drive blended average premium calculation.
-- One row per product per config.

CREATE TABLE public.producer_comp_product_mix (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id       uuid NOT NULL REFERENCES producer_comp_configs(id) ON DELETE CASCADE,
  agency_id       uuid NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  product_name    text NOT NULL,            -- e.g. "Auto", "Home", "Condo"
  mix_pct         numeric(5,4) NOT NULL,    -- e.g. 0.53 = 53%
  avg_prem_item   numeric(10,2) NOT NULL,   -- average premium per item for this product
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.producer_comp_product_mix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_manages_product_mix"
  ON public.producer_comp_product_mix FOR ALL
  USING (
    agency_id IN (
      SELECT am.agency_id FROM agency_memberships am
      WHERE am.user_id = auth.uid()
        AND am.status = 'active'
        AND am.agency_role = 'agent'
    )
  );
