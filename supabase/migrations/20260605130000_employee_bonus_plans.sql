-- ============================================================================
-- Employee Bonus Plans — live, editable retention-bonus terms (per employee)
-- ============================================================================
-- Holds the CURRENT, editable bonus terms for an employee. This is the digital
-- reflection of what's in their comp agreement. It is deliberately separate from
-- retention_bonus_ledger (which is the frozen, paid history).
--
-- Gating: the scorecard's Monthly Bonus block only renders when an enabled plan
-- exists. With nothing configured, no bonus is shown — so the UI never promises
-- money that hasn't been contracted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_bonus_plans (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  enabled          BOOLEAN NOT NULL DEFAULT false,
  bonus_unit       TEXT NOT NULL DEFAULT 'connected_call'
                     CHECK (bonus_unit IN ('connected_call', 'save')),
  threshold        INTEGER NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  per_unit_amount  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_unit_amount >= 0),

  notes            TEXT,
  created_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- one current plan per employee (history lives in retention_bonus_ledger)
  CONSTRAINT employee_bonus_plans_unique_employee UNIQUE (employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_bonus_plans_agency
  ON public.employee_bonus_plans (agency_id);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Read: a principal of the agency OR the employee reading their own plan
-- (the scorecard needs it to decide whether to show the bonus). Write: principals.
ALTER TABLE public.employee_bonus_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_bonus_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bonus_plans_select" ON public.employee_bonus_plans;
CREATE POLICY "bonus_plans_select" ON public.employee_bonus_plans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = employee_bonus_plans.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_bonus_plans.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bonus_plans_insert_principal" ON public.employee_bonus_plans;
CREATE POLICY "bonus_plans_insert_principal" ON public.employee_bonus_plans
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = employee_bonus_plans.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "bonus_plans_update_principal" ON public.employee_bonus_plans;
CREATE POLICY "bonus_plans_update_principal" ON public.employee_bonus_plans
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = employee_bonus_plans.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = employee_bonus_plans.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "bonus_plans_delete_principal" ON public.employee_bonus_plans;
CREATE POLICY "bonus_plans_delete_principal" ON public.employee_bonus_plans
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = employee_bonus_plans.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  );

-- ─── updated_at trigger (reuses the shared function) ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_bonus_plans_updated_at ON public.employee_bonus_plans;
CREATE TRIGGER trg_employee_bonus_plans_updated_at
  BEFORE UPDATE ON public.employee_bonus_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

COMMENT ON TABLE public.employee_bonus_plans IS
  'Live, editable retention-bonus terms per employee. Gates the scorecard bonus display; frozen payouts live in retention_bonus_ledger.';

-- ============================================================================
-- ROLLBACK (reference only; do not execute as part of this migration)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_employee_bonus_plans_updated_at ON public.employee_bonus_plans;
-- DROP TABLE IF EXISTS public.employee_bonus_plans;
