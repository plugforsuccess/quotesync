-- ============================================================================
-- Policy changes require a licensed agent
-- ============================================================================
-- Originally only coverage/premium ("Coverage & Price") were flagged as needing
-- a license; the carrier-side policy edits (vehicle add/remove, mortgagee,
-- billing, address) were treated as front-desk mechanical work. Agency policy is
-- now that ALL policy changes must be made by a licensed agent — only pure
-- clerical work (ID cards, documents, other) stays front-desk.
--
-- This widens the requires_license default seeded on insert. It does NOT block
-- the front desk from LOGGING these tasks (intake still happens the moment a
-- call lands); it records who must WORK them. Backfills existing open rows.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.stamp_service_task()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_emp uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_emp FROM employees WHERE auth_user_id = auth.uid() LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    IF NEW.created_by_id IS NULL THEN NEW.created_by_id := v_emp; END IF;
    -- A licensed agent must make any policy change (coverage/price + carrier
    -- edits). Only clerical types (id_cards, document, other) stay front-desk.
    IF NEW.requires_license IS NOT DISTINCT FROM false
       AND NEW.task_type IN ('coverage','premium','mortgagee','vehicle','billing','address') THEN
      NEW.requires_license := true;
    END IF;
  END IF;

  NEW.updated_at := now();

  -- Stamp completion exactly when the task transitions into a terminal state.
  IF NEW.status IN ('done','cancelled')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.completed_at := COALESCE(NEW.completed_at, now());
    NEW.completed_by_id := COALESCE(NEW.completed_by_id, v_emp);
  ELSIF NEW.status NOT IN ('done','cancelled') THEN
    -- Reopened — clear stale completion stamps.
    NEW.completed_at := NULL;
    NEW.completed_by_id := NULL;
  END IF;

  RETURN NEW;
END $$;

-- Backfill: flag existing active policy-change tasks that predate this rule.
UPDATE public.service_tasks
   SET requires_license = true
 WHERE requires_license = false
   AND status IN ('open','in_progress','blocked')
   AND task_type IN ('mortgagee','vehicle','billing','address');
