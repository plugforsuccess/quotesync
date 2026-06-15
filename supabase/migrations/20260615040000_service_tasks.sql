-- ============================================================================
-- service_tasks — first-class admin/service task queue (the "batchable" work)
-- ============================================================================
-- Renewal and cancel cases have first-class rows; routine admin work (mortgagee
-- changes, vehicle add/remove, billing changes, premium questions, ID cards…)
-- did not. The Operating Playbook's "Afternoon — SERVICE BATCH" depends on these
-- being captured as taggable, due-dated, type-grouped items so they can be
-- cleared in one protected block instead of worked as phone interrupts.
--
-- This table is that object. Front Desk logs a task the moment a call lands;
-- nobody works it then. Later, the licensed/service block sorts by due date,
-- groups by task_type, and clears the queue in one pass.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.service_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id       uuid NOT NULL,

  -- The batch key. Grouping by type is the whole point — doing eight mortgagee
  -- edits in a row beats eight different task types interleaved.
  task_type       text NOT NULL DEFAULT 'other'
                    CHECK (task_type IN (
                      'mortgagee','vehicle','billing','premium','coverage',
                      'address','id_cards','document','other')),

  title           text NOT NULL CHECK (length(trim(title)) > 0),
  detail          text,

  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','blocked','done','cancelled')),
  priority        text NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('urgent','high','normal','low')),

  -- Lane split: a licensed item (coverage change, "what should I have") can't be
  -- worked by the unlicensed Front Desk. Defaults are seeded by task_type below.
  requires_license boolean NOT NULL DEFAULT false,

  policy_no       text,
  customer_name   text,
  customer_phone  text,

  -- SLA. Tasks sort by due_date inside each type group; past-due floats up.
  due_date        date,

  assigned_to_id  uuid,
  created_by_id   uuid,
  source          text NOT NULL DEFAULT 'inbound_call'
                    CHECK (source IN ('inbound_call','email','walk_in','renewal_call','internal','other')),

  completed_at    timestamptz,
  completed_by_id uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_tasks_queue    ON public.service_tasks (agency_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_service_tasks_type     ON public.service_tasks (agency_id, task_type, status);
CREATE INDEX IF NOT EXISTS idx_service_tasks_assignee ON public.service_tasks (assigned_to_id, status);

ALTER TABLE public.service_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_tasks_select ON public.service_tasks FOR SELECT
  USING (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
CREATE POLICY service_tasks_insert ON public.service_tasks FOR INSERT
  WITH CHECK (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
CREATE POLICY service_tasks_update ON public.service_tasks FOR UPDATE
  USING (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status))
  WITH CHECK (agency_id IN (SELECT agency_id FROM agency_memberships WHERE user_id = auth.uid() AND status = 'active'::membership_status));
-- No DELETE policy → close via status='cancelled'; service_role retains admin.

GRANT SELECT, INSERT, UPDATE ON public.service_tasks TO authenticated;

-- Server-authoritative stamping: created_by on insert, completed_* on done,
-- updated_at on every write, and a sane requires_license default per type.
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
    -- Licensed-judgment work routes to a licensed rep; clerical does not.
    IF NEW.requires_license IS NOT DISTINCT FROM false
       AND NEW.task_type IN ('coverage','premium') THEN
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

DROP TRIGGER IF EXISTS trg_stamp_service_task ON public.service_tasks;
CREATE TRIGGER trg_stamp_service_task BEFORE INSERT OR UPDATE ON public.service_tasks
  FOR EACH ROW EXECUTE FUNCTION public.stamp_service_task();

-- Let case_notes attach to a service task too, so the same append-only,
-- searchable note feed covers admin work — not just renewal/cancel cases.
DO $$
BEGIN
  ALTER TABLE public.case_notes DROP CONSTRAINT IF EXISTS case_notes_case_type_check;
  ALTER TABLE public.case_notes
    ADD CONSTRAINT case_notes_case_type_check CHECK (case_type IN ('renewal','cancel','service'));
EXCEPTION WHEN undefined_table THEN
  -- case_notes not present in this environment yet; nothing to widen.
  NULL;
END $$;
