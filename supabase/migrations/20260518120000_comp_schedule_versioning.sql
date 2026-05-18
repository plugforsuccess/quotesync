-- ============================================================================
-- Comp Schedule Versioning — Time-Effective + State-Aware Commission Rates
-- ============================================================================
-- Adds a new table `agency_comp_schedules` that represents a named, dated,
-- state-scoped set of commission rates. Existing `agency_commission_rates`
-- rows are linked to schedules via a new `schedule_id` FK.
--
-- This enables side-by-side comparison of (e.g.) "Allstate GA 2026" and
-- "Allstate GA 2027 Announced" schedules without overwriting current rates.
-- ============================================================================

-- ─── 1. agency_comp_schedules ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agency_comp_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id           UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  carrier_name        TEXT NOT NULL DEFAULT 'Allstate',
  state_code          CHAR(2) NOT NULL CHECK (state_code ~ '^[A-Z]{2}$'),
  schedule_label      TEXT NOT NULL,

  effective_from      DATE NOT NULL,
  effective_to        DATE NULL,
  is_announced_only   BOOLEAN NOT NULL DEFAULT false,

  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT comp_schedules_label_unique
    UNIQUE (agency_id, carrier_name, state_code, schedule_label),
  CONSTRAINT comp_schedules_dates_valid
    CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS idx_comp_schedules_lookup
  ON public.agency_comp_schedules (agency_id, carrier_name, state_code, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_comp_schedules_announced
  ON public.agency_comp_schedules (agency_id, is_announced_only)
  WHERE is_announced_only = true;

ALTER TABLE public.agency_comp_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_schedules_select" ON public.agency_comp_schedules
  FOR SELECT USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "comp_schedules_insert_principal" ON public.agency_comp_schedules
  FOR INSERT WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_comp_schedules.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

CREATE POLICY "comp_schedules_update_principal" ON public.agency_comp_schedules
  FOR UPDATE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_comp_schedules.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  )
  WITH CHECK (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "comp_schedules_delete_principal" ON public.agency_comp_schedules
  FOR DELETE USING (
    agency_id = (SELECT agency_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.agency_memberships
      WHERE agency_memberships.user_id = auth.uid()
        AND agency_memberships.agency_id = agency_comp_schedules.agency_id
        AND agency_memberships.agency_role = 'principal'
        AND agency_memberships.status = 'active'
    )
  );

-- ─── 2. Updated-at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comp_schedules_updated_at ON public.agency_comp_schedules;
CREATE TRIGGER trg_comp_schedules_updated_at
  BEFORE UPDATE ON public.agency_comp_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── 3. Add schedule_id to agency_commission_rates ───────────────────────────

ALTER TABLE public.agency_commission_rates
  ADD COLUMN IF NOT EXISTS schedule_id UUID NULL REFERENCES public.agency_comp_schedules(id) ON DELETE CASCADE;

-- Drop the legacy unique constraint so multiple schedules can coexist per agency.
-- The constraint name varies by environment; this DO block finds and drops it.
DO $$
DECLARE
  _constraint_name TEXT;
BEGIN
  SELECT con.conname INTO _constraint_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'agency_commission_rates'
    AND con.contype = 'u'
    AND ARRAY['agency_id', 'product_key', 'tier_key']::text[] <@ (
      SELECT array_agg(att.attname ORDER BY att.attnum)
      FROM pg_attribute att
      WHERE att.attrelid = con.conrelid
        AND att.attnum = ANY(con.conkey)
    );

  IF _constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.agency_commission_rates DROP CONSTRAINT %I', _constraint_name);
  END IF;
END $$;

-- ─── 4. Backfill: create a "Legacy" schedule per agency and link existing rates

DO $$
DECLARE
  _agency RECORD;
  _schedule_id UUID;
  _carrier TEXT;
  _state CHAR(2) := 'GA';  -- All current production data is Georgia.
BEGIN
  FOR _agency IN
    SELECT DISTINCT agency_id FROM public.agency_commission_rates
    WHERE schedule_id IS NULL
  LOOP
    SELECT carrier_name INTO _carrier
      FROM public.agency_carrier_config
      WHERE agency_id = _agency.agency_id;
    IF _carrier IS NULL THEN
      _carrier := 'Allstate';
    END IF;

    INSERT INTO public.agency_comp_schedules (
      agency_id, carrier_name, state_code, schedule_label,
      effective_from, effective_to, is_announced_only, notes
    ) VALUES (
      _agency.agency_id, _carrier, _state, 'Default (Pre-Versioning)',
      '2025-01-01', NULL, false,
      'Auto-generated during comp schedule versioning migration. ' ||
      'Represents the rate set in production before versioning was introduced.'
    )
    ON CONFLICT (agency_id, carrier_name, state_code, schedule_label) DO NOTHING
    RETURNING id INTO _schedule_id;

    -- If schedule already existed (idempotent rerun), fetch its id
    IF _schedule_id IS NULL THEN
      SELECT id INTO _schedule_id FROM public.agency_comp_schedules
        WHERE agency_id = _agency.agency_id
          AND carrier_name = _carrier
          AND state_code = _state
          AND schedule_label = 'Default (Pre-Versioning)';
    END IF;

    UPDATE public.agency_commission_rates
      SET schedule_id = _schedule_id
      WHERE agency_id = _agency.agency_id
        AND schedule_id IS NULL;
  END LOOP;
END $$;

-- ─── 5. Lock down schedule_id and add new unique constraint ──────────────────

ALTER TABLE public.agency_commission_rates
  ALTER COLUMN schedule_id SET NOT NULL;

ALTER TABLE public.agency_commission_rates
  ADD CONSTRAINT agency_commission_rates_unique_versioned
    UNIQUE (schedule_id, product_key, tier_key);

CREATE INDEX IF NOT EXISTS idx_commission_rates_schedule
  ON public.agency_commission_rates (schedule_id);

-- ─── 6. Helper view: which schedule is active for an agency right now? ───────

CREATE OR REPLACE VIEW public.v_active_comp_schedule AS
SELECT DISTINCT ON (agency_id, carrier_name, state_code)
  agency_id,
  carrier_name,
  state_code,
  id AS schedule_id,
  schedule_label,
  effective_from,
  effective_to
FROM public.agency_comp_schedules
WHERE is_announced_only = false
  AND effective_from <= CURRENT_DATE
  AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
ORDER BY agency_id, carrier_name, state_code, effective_from DESC;

-- ============================================================================
-- ROLLBACK (reference only; do not execute as part of this migration)
-- ============================================================================
-- DROP VIEW IF EXISTS public.v_active_comp_schedule;
-- ALTER TABLE public.agency_commission_rates DROP CONSTRAINT agency_commission_rates_unique_versioned;
-- ALTER TABLE public.agency_commission_rates ALTER COLUMN schedule_id DROP NOT NULL;
-- ALTER TABLE public.agency_commission_rates DROP COLUMN schedule_id;
-- DROP TRIGGER IF EXISTS trg_comp_schedules_updated_at ON public.agency_comp_schedules;
-- DROP TABLE IF EXISTS public.agency_comp_schedules;
