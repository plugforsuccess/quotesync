-- ============================================================================
-- Book Composition Tables — Carrier Concentration & Blast-Radius
-- ============================================================================

-- ─── 1. carriers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.carriers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code           TEXT NOT NULL UNIQUE,
  display_name   TEXT NOT NULL,
  carrier_group  TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carriers_select_all_authenticated" ON public.carriers;
CREATE POLICY "carriers_select_all_authenticated" ON public.carriers
  FOR SELECT USING (auth.uid() IS NOT NULL);

INSERT INTO public.carriers (code, display_name, carrier_group) VALUES
  ('allstate',          'Allstate',          'standard'),
  ('progressive',       'Progressive',       'standard'),
  ('state_farm',        'State Farm',        'standard'),
  ('geico',             'GEICO',             'standard'),
  ('liberty_mutual',    'Liberty Mutual',    'standard'),
  ('farmers',           'Farmers',           'standard'),
  ('nationwide',        'Nationwide',        'standard'),
  ('travelers',         'Travelers',         'standard'),
  ('usaa',              'USAA',              'standard'),
  ('safeco',            'Safeco',            'standard'),
  ('hartford',          'The Hartford',      'standard'),
  ('american_family',   'American Family',   'standard'),
  ('national_general',  'National General',  'non_standard'),
  ('bristol_west',      'Bristol West',      'non_standard'),
  ('dairyland',         'Dairyland',         'non_standard'),
  ('the_general',       'The General',       'non_standard'),
  ('foremost',          'Foremost',          'specialty'),
  ('hippo',             'Hippo',             'specialty'),
  ('lemonade',          'Lemonade',          'specialty'),
  ('other',             'Other',             'standard')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. agency_book_snapshots ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agency_book_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id             UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  carrier_code          TEXT NOT NULL REFERENCES public.carriers(code) ON DELETE RESTRICT,
  product_key           TEXT NOT NULL,
  state_code            CHAR(2) NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  policy_count          INTEGER NOT NULL CHECK (policy_count >= 0),
  total_premium         NUMERIC(12, 2) NOT NULL CHECK (total_premium >= 0),
  avg_commission_rate   NUMERIC(5, 4) CHECK (avg_commission_rate IS NULL
                                            OR (avg_commission_rate > 0 AND avg_commission_rate <= 1)),
  notes                 TEXT,
  snapshot_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  is_current            BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT book_snapshots_current_unique
    UNIQUE (agency_id, carrier_code, product_key, state_code, is_current)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_book_snapshots_current
  ON public.agency_book_snapshots (agency_id, is_current)
  WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_book_snapshots_history
  ON public.agency_book_snapshots (agency_id, snapshot_date DESC);

ALTER TABLE public.agency_book_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "book_snapshots_select" ON public.agency_book_snapshots;
CREATE POLICY "book_snapshots_select" ON public.agency_book_snapshots
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "book_snapshots_insert_principal" ON public.agency_book_snapshots;
CREATE POLICY "book_snapshots_insert_principal" ON public.agency_book_snapshots
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_book_snapshots.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

DROP POLICY IF EXISTS "book_snapshots_update_principal" ON public.agency_book_snapshots;
CREATE POLICY "book_snapshots_update_principal" ON public.agency_book_snapshots
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_book_snapshots.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "book_snapshots_delete_principal" ON public.agency_book_snapshots;
CREATE POLICY "book_snapshots_delete_principal" ON public.agency_book_snapshots
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_book_snapshots.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

DROP TRIGGER IF EXISTS trg_book_snapshots_updated_at ON public.agency_book_snapshots;
CREATE TRIGGER trg_book_snapshots_updated_at
  BEFORE UPDATE ON public.agency_book_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── 3. policies (forward-compatible, empty in v1) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.policies (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id         UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  policy_no         TEXT NOT NULL,
  customer_name     TEXT,
  carrier_code      TEXT NOT NULL REFERENCES public.carriers(code) ON DELETE RESTRICT,
  product_key       TEXT NOT NULL,
  state_code        CHAR(2) NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  annual_premium    NUMERIC(10, 2) CHECK (annual_premium IS NULL OR annual_premium > 0),
  commission_rate   NUMERIC(5, 4) CHECK (commission_rate IS NULL OR (commission_rate > 0 AND commission_rate <= 1)),
  effective_date    DATE,
  expiration_date   DATE,
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'cancelled', 'non_renewal', 'lapsed', 'rewritten', 'unknown')),
  producer_id       UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  source            TEXT NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'csv_upload', 'api_sync', 'snapshot')),
  imported_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT policies_unique_per_agency UNIQUE (agency_id, policy_no, carrier_code)
);

CREATE INDEX IF NOT EXISTS idx_policies_book_composition
  ON public.policies (agency_id, carrier_code, product_key, status);

CREATE INDEX IF NOT EXISTS idx_policies_active
  ON public.policies (agency_id, status)
  WHERE status = 'active';

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "policies_select" ON public.policies;
CREATE POLICY "policies_select" ON public.policies
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "policies_insert_principal" ON public.policies;
CREATE POLICY "policies_insert_principal" ON public.policies
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = policies.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

DROP POLICY IF EXISTS "policies_update_principal" ON public.policies;
CREATE POLICY "policies_update_principal" ON public.policies
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = policies.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

DROP TRIGGER IF EXISTS trg_policies_updated_at ON public.policies;
CREATE TRIGGER trg_policies_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── 4. Helper view: current book composition ────────────────────────────────

CREATE OR REPLACE VIEW public.v_agency_book_composition AS
SELECT
  bs.id,
  bs.agency_id,
  bs.carrier_code,
  c.display_name AS carrier_name,
  bs.product_key,
  bs.state_code,
  bs.policy_count,
  bs.total_premium,
  bs.avg_commission_rate,
  (bs.total_premium * COALESCE(bs.avg_commission_rate, 0))::NUMERIC(12, 2) AS estimated_annual_commission,
  bs.snapshot_date,
  bs.notes
FROM public.agency_book_snapshots bs
JOIN public.carriers c ON c.code = bs.carrier_code
WHERE bs.is_current = true;

-- ─── 5. Seed demo data for Wiley-Wilson ───────────────────────────────────────

DO $$
DECLARE
  _agency_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agencies WHERE id = _agency_id) THEN
    RAISE NOTICE 'Demo agency not found; skipping book snapshot seed.';
    RETURN;
  END IF;

  INSERT INTO public.agency_book_snapshots
    (agency_id, carrier_code, product_key, state_code, policy_count, total_premium, avg_commission_rate, notes)
  VALUES
    (_agency_id, 'allstate', 'auto',       'GA', 850, 1870000, 0.10, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'ho',         'GA', 420, 1218000, 0.12, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'condo',      'GA',  35,   38500, 0.12, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'renters',    'GA',  80,   24000, 0.10, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'pup',        'GA',  45,   13500, 0.15, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'boat',       'GA',   8,    4800, 0.10, 'Demo seed — replace with real figures'),
    (_agency_id, 'allstate', 'motor_club', 'GA', 120,    9600, 0.05, 'Demo seed — replace with real figures')
  ON CONFLICT (agency_id, carrier_code, product_key, state_code, is_current) DO NOTHING;

  RAISE NOTICE 'Seeded Wiley-Wilson book snapshot (7 rows, all Allstate GA).';
END $$;
