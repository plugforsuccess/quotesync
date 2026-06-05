-- ============================================================================
-- Retention Bonus Ledger — durable, non-expiring record of bonus payouts
-- ============================================================================
-- The system of record for the retention bonus. A row is computed once at
-- month close and FROZEN (plan terms + verified result are copied in), so it
-- survives the 180-day PII purge of rc_call_log and is auditable for payroll.
--
-- Pairs with the live comp plan (which holds editable terms and gates the
-- scorecard's "estimated" display); this table is the historical, paid record.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.retention_bonus_ledger (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_month     DATE NOT NULL,             -- first day of the bonus month (YYYY-MM-01)

  -- Frozen plan terms applied for THIS period (copied from the comp plan at close)
  bonus_unit       TEXT NOT NULL DEFAULT 'connected_call'
                     CHECK (bonus_unit IN ('connected_call', 'save')),
  threshold        INTEGER NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  per_unit_amount  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_unit_amount >= 0),

  -- Frozen computed result
  verified_count   INTEGER NOT NULL DEFAULT 0 CHECK (verified_count >= 0),
  payable_units    INTEGER NOT NULL DEFAULT 0 CHECK (payable_units >= 0),
  bonus_amount     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (bonus_amount >= 0),

  -- Provenance / audit
  rc_batch_ids     UUID[],                    -- rc_call_log_batches that fed this close
  detail           JSONB,                     -- frozen per-attempt snapshot (PII-light)
  status           TEXT NOT NULL DEFAULT 'finalized'
                     CHECK (status IN ('draft', 'finalized', 'paid', 'void')),
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  computed_by      UUID,                      -- principal/admin who closed the month
  paid_at          TIMESTAMPTZ,
  notes            TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- period_month must be the first of a month
  CONSTRAINT retention_bonus_ledger_period_is_month_start
    CHECK (period_month = date_trunc('month', period_month)::date),
  -- one ledger row per employee per month
  CONSTRAINT retention_bonus_ledger_unique_period
    UNIQUE (agency_id, employee_id, period_month)
);

CREATE INDEX IF NOT EXISTS idx_retention_bonus_ledger_agency_period
  ON public.retention_bonus_ledger (agency_id, period_month DESC);
CREATE INDEX IF NOT EXISTS idx_retention_bonus_ledger_employee_period
  ON public.retention_bonus_ledger (employee_id, period_month DESC);

-- ─── Row Level Security ──────────────────────────────────────────────────────
-- Individual compensation is sensitive: reads are limited to a principal of the
-- agency OR the employee themselves. Writes are principals only. (Edge functions
-- using the service role bypass RLS for automated month-close computation.)
ALTER TABLE public.retention_bonus_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_bonus_ledger FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bonus_ledger_select" ON public.retention_bonus_ledger;
CREATE POLICY "bonus_ledger_select" ON public.retention_bonus_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = retention_bonus_ledger.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
    OR EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = retention_bonus_ledger.employee_id
        AND e.auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "bonus_ledger_insert_principal" ON public.retention_bonus_ledger;
CREATE POLICY "bonus_ledger_insert_principal" ON public.retention_bonus_ledger
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = retention_bonus_ledger.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "bonus_ledger_update_principal" ON public.retention_bonus_ledger;
CREATE POLICY "bonus_ledger_update_principal" ON public.retention_bonus_ledger
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = retention_bonus_ledger.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = retention_bonus_ledger.agency_id
        AND m.agency_role = 'principal'
        AND m.status = 'active'
    )
  );

DROP POLICY IF EXISTS "bonus_ledger_delete_principal" ON public.retention_bonus_ledger;
CREATE POLICY "bonus_ledger_delete_principal" ON public.retention_bonus_ledger
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.agency_memberships m
      WHERE m.user_id = auth.uid()
        AND m.agency_id = retention_bonus_ledger.agency_id
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

DROP TRIGGER IF EXISTS trg_retention_bonus_ledger_updated_at ON public.retention_bonus_ledger;
CREATE TRIGGER trg_retention_bonus_ledger_updated_at
  BEFORE UPDATE ON public.retention_bonus_ledger
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

COMMENT ON TABLE public.retention_bonus_ledger IS
  'Durable, non-expiring record of retention-bonus payouts. Frozen at month close so it survives the 180-day rc_call_log PII purge; system of record for payroll/audit.';
COMMENT ON COLUMN public.retention_bonus_ledger.bonus_unit IS
  'What the bonus is paid on: connected_call (verified RingCentral connected call) or save (retained policy — requires a separate retained-outcome signal).';
COMMENT ON COLUMN public.retention_bonus_ledger.detail IS
  'Frozen per-attempt verification snapshot (e.g. policy_no + attempt timestamps). PII-light — do not store raw phone numbers.';

-- ============================================================================
-- ROLLBACK (reference only; do not execute as part of this migration)
-- ============================================================================
-- DROP TRIGGER IF EXISTS trg_retention_bonus_ledger_updated_at ON public.retention_bonus_ledger;
-- DROP TABLE IF EXISTS public.retention_bonus_ledger;
