-- ============================================================================
-- Agency Configuration Layer — Multi-Carrier SaaS
-- Creates config tables to replace hardcoded Allstate constants.
-- Dashboard keeps using hardcoded constants for now; these tables store the
-- canonical config so data written today is forward-compatible.
-- ============================================================================

-- ─── 1. agency_carrier_config ───────────────────────────────────────────────
-- One row per agency. Carrier identity + top-level commission settings.

CREATE TABLE IF NOT EXISTS public.agency_carrier_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID NOT NULL UNIQUE REFERENCES agencies(id) ON DELETE CASCADE,

  -- Carrier identity
  carrier_name          TEXT NOT NULL DEFAULT 'Allstate',
  carrier_code          TEXT,

  -- Commission settings
  commissionable_factor NUMERIC(5,4) NOT NULL DEFAULT 0.9350,
  commission_goal       NUMERIC(10,2) NOT NULL DEFAULT 40000,
  premium_goal          NUMERIC(10,2) NOT NULL DEFAULT 160000,

  -- VC / incentive program (null = carrier has no such program)
  vc_baseline_target    INTEGER,
  vc_program_label      TEXT,

  -- Producer ID field label for this carrier
  producer_id_label     TEXT NOT NULL DEFAULT 'Bind ID',
  producer_id_format    TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agency_carrier_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_carrier_config_select" ON public.agency_carrier_config
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 2. agency_products ─────────────────────────────────────────────────────
-- One row per product line per agency.

CREATE TABLE IF NOT EXISTS public.agency_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  product_key     TEXT NOT NULL,
  label           TEXT NOT NULL,
  color           TEXT NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  points_per_item INTEGER NOT NULL DEFAULT 0,
  single_item     BOOLEAN NOT NULL DEFAULT false,

  sort_order      INTEGER NOT NULL DEFAULT 99,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, product_key)
);

ALTER TABLE public.agency_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_products_select" ON public.agency_products
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 3. agency_tiers ────────────────────────────────────────────────────────
-- One row per commission tier per agency.

CREATE TABLE IF NOT EXISTS public.agency_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,

  tier_key    TEXT NOT NULL,
  label       TEXT NOT NULL,
  color       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 99,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, tier_key)
);

ALTER TABLE public.agency_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_tiers_select" ON public.agency_tiers
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 4. agency_commission_rates ─────────────────────────────────────────────
-- One row per product+tier combination per agency.

CREATE TABLE IF NOT EXISTS public.agency_commission_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  tier_key    TEXT NOT NULL,
  rate        NUMERIC(5,4) NOT NULL CHECK (rate > 0 AND rate <= 1),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, product_key, tier_key)
);

ALTER TABLE public.agency_commission_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_commission_rates_select" ON public.agency_commission_rates
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- ─── 5. employee_producer_codes ─────────────────────────────────────────────
-- Generic replacement for employees.allstate_id. One employee can have codes
-- on multiple carriers.

CREATE TABLE IF NOT EXISTS public.employee_producer_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id   UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  carrier     TEXT NOT NULL,
  code        TEXT NOT NULL,
  label       TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (agency_id, carrier, code)
);

CREATE INDEX IF NOT EXISTS idx_producer_codes_lookup
  ON public.employee_producer_codes (agency_id, carrier, code);

ALTER TABLE public.employee_producer_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_producer_codes_select" ON public.employee_producer_codes
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- Allow admins to insert/update producer codes
CREATE POLICY "employee_producer_codes_insert" ON public.employee_producer_codes
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "employee_producer_codes_update" ON public.employee_producer_codes
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM profiles WHERE id = auth.uid())
  );

-- ============================================================================
-- Seed Allstate config for Wiley-Wilson agency
-- ============================================================================

DO $$
DECLARE
  _agency_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Only seed if the agency exists
  IF EXISTS (SELECT 1 FROM agencies WHERE id = _agency_id) THEN

    -- agency_carrier_config
    INSERT INTO public.agency_carrier_config (
      agency_id, carrier_name, carrier_code,
      commissionable_factor, commission_goal, premium_goal,
      vc_baseline_target, vc_program_label,
      producer_id_label
    ) VALUES (
      _agency_id, 'Allstate', 'ALST',
      0.9350, 40000, 160000,
      53, 'VC Baseline',
      'Bind ID'
    ) ON CONFLICT (agency_id) DO NOTHING;

    -- agency_products
    INSERT INTO public.agency_products (agency_id, product_key, label, color, points_per_item, single_item, sort_order) VALUES
      (_agency_id, 'auto',          'Auto',              '#3B82F6', 10, false, 1),
      (_agency_id, 'ho',            'HO / Condo',        '#10B981', 20, true,  2),
      (_agency_id, 'renters',       'Renters',           '#F59E0B',  5, true,  3),
      (_agency_id, 'landlord',      'Landlord',          '#06B6D4', 20, true,  4),
      (_agency_id, 'specialty_auto','Specialty Auto',     '#8B5CF6',  5, false, 5),
      (_agency_id, 'pup',           'Personal Umbrella', '#EC4899',  5, true,  6),
      (_agency_id, 'manufactured',  'Manufactured Home', '#F97316',  5, true,  7),
      (_agency_id, 'boat',          'Boat Owners',       '#0EA5E9',  5, true,  8),
      (_agency_id, 'other',         'Other',             '#64748B',  0, false, 99)
    ON CONFLICT (agency_id, product_key) DO NOTHING;

    -- agency_tiers
    INSERT INTO public.agency_tiers (agency_id, tier_key, label, color, sort_order) VALUES
      (_agency_id, 'preferred', 'Preferred', '#10B981', 1),
      (_agency_id, 'bundled',   'Bundled',   '#3B82F6', 2),
      (_agency_id, 'monoline',  'Monoline',  '#64748B', 3)
    ON CONFLICT (agency_id, tier_key) DO NOTHING;

    -- agency_commission_rates
    INSERT INTO public.agency_commission_rates (agency_id, product_key, tier_key, rate) VALUES
      (_agency_id, 'auto',    'preferred', 0.25),
      (_agency_id, 'auto',    'bundled',   0.20),
      (_agency_id, 'auto',    'monoline',  0.15),
      (_agency_id, 'ho',      'preferred', 0.29),
      (_agency_id, 'ho',      'bundled',   0.25),
      (_agency_id, 'ho',      'monoline',  0.16),
      (_agency_id, 'renters', 'preferred', 0.26),
      (_agency_id, 'renters', 'bundled',   0.21),
      (_agency_id, 'renters', 'monoline',  0.15),
      (_agency_id, 'other',   'preferred', 0.26),
      (_agency_id, 'other',   'bundled',   0.21),
      (_agency_id, 'other',   'monoline',  0.15)
    ON CONFLICT (agency_id, product_key, tier_key) DO NOTHING;

    -- Migrate existing allstate_id values from employees to employee_producer_codes
    INSERT INTO public.employee_producer_codes (agency_id, employee_id, carrier, code)
    SELECT e.org_id, e.id, 'allstate', e.allstate_id
    FROM public.employees e
    WHERE e.org_id = _agency_id
      AND e.allstate_id IS NOT NULL
      AND e.allstate_id != ''
    ON CONFLICT (agency_id, carrier, code) DO NOTHING;

  END IF;
END $$;
