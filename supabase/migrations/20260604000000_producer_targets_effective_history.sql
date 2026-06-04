-- Producer performance targets: enable effective-dated goal history.
--
-- The table already carries an `effective_date` column (default CURRENT_DATE),
-- but the UNIQUE (org_id, employee_user_id) constraint allowed only ONE row per
-- producer — so every save overwrote the prior goal and no history survived.
--
-- Widen the uniqueness to include effective_date so each goal change is kept as
-- its own in-force row. Reads resolve the latest row with effective_date <= the
-- as-of date (mirrors cs_performance_targets). RLS is unchanged: principals
-- manage their org's rows, producers read their own.

DO $$
BEGIN
  -- Drop the legacy 2-column unique constraint if it's still present.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.producer_performance_targets'::regclass
      AND conname  = 'producer_performance_targets_org_id_employee_user_id_key'
  ) THEN
    ALTER TABLE public.producer_performance_targets
      DROP CONSTRAINT producer_performance_targets_org_id_employee_user_id_key;
  END IF;

  -- Add the effective-dated unique constraint if it isn't there yet.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.producer_performance_targets'::regclass
      AND conname  = 'producer_performance_targets_org_emp_eff_key'
  ) THEN
    ALTER TABLE public.producer_performance_targets
      ADD CONSTRAINT producer_performance_targets_org_emp_eff_key
      UNIQUE (org_id, employee_user_id, effective_date);
  END IF;
END $$;

-- Covering index for the "latest in-force goal per producer" read pattern.
CREATE INDEX IF NOT EXISTS idx_ppt_org_emp_eff
  ON public.producer_performance_targets (org_id, employee_user_id, effective_date DESC);
