-- =============================================================================
-- Punch Events + Time Entry Audit Log
-- =============================================================================
-- Adds two tables to support erratic-hours monitoring:
--   1. punch_events      — immutable log of every clock-in/out/lunch punch,
--                          including source IP, geolocation, and user agent.
--   2. time_entry_audit  — immutable log of every admin manual edit to
--                          employee_time_entries (who, when, before, after).
-- Neither table is writable by employees; edge function (service role) and
-- the admin RLS policy are the only paths that insert rows.

-- ── punch_events ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.punch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('clock_in','lunch_out','lunch_in','clock_out')),
  event_time timestamptz NOT NULL DEFAULT now(),
  work_date date NOT NULL,
  punch_time time NOT NULL,
  source_ip inet,
  user_agent text,
  lat numeric(9,6),
  lng numeric(9,6),
  accuracy_m numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_punch_events_employee_date
  ON public.punch_events (employee_user_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_punch_events_org_time
  ON public.punch_events (org_id, event_time DESC);

ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;

-- Admin-only read. Service role bypasses RLS for edge function writes.
DROP POLICY IF EXISTS "admin_read_punch_events" ON public.punch_events;
CREATE POLICY "admin_read_punch_events"
ON public.punch_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);

-- ── time_entry_audit ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.time_entry_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid,                -- nullable after DELETE cascade
  employee_user_id uuid NOT NULL,
  work_date date NOT NULL,
  changed_by uuid,                   -- auth.uid() of the editor
  change_type text NOT NULL CHECK (change_type IN ('INSERT','UPDATE','DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_entry_audit_employee_date
  ON public.time_entry_audit (employee_user_id, work_date DESC);

CREATE INDEX IF NOT EXISTS idx_time_entry_audit_changed_at
  ON public.time_entry_audit (changed_at DESC);

ALTER TABLE public.time_entry_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_read_time_entry_audit" ON public.time_entry_audit;
CREATE POLICY "admin_read_time_entry_audit"
ON public.time_entry_audit
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);

-- ── Audit trigger on employee_time_entries ───────────────────────────────────
-- Captures full row snapshots on INSERT / UPDATE / DELETE. SECURITY DEFINER
-- lets the trigger write to time_entry_audit regardless of the caller's RLS
-- context, while the audit table's own RLS keeps reads admin-only.
CREATE OR REPLACE FUNCTION public.log_time_entry_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.time_entry_audit
      (time_entry_id, employee_user_id, work_date, changed_by, change_type, old_values, new_values)
    VALUES
      (NEW.id, NEW.employee_user_id, NEW.work_date, auth.uid(), 'INSERT', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log when tracked fields actually changed
    IF (OLD.start_time IS DISTINCT FROM NEW.start_time
        OR OLD.lunch_out IS DISTINCT FROM NEW.lunch_out
        OR OLD.lunch_in IS DISTINCT FROM NEW.lunch_in
        OR OLD.end_time IS DISTINCT FROM NEW.end_time
        OR OLD.code IS DISTINCT FROM NEW.code
        OR OLD.location IS DISTINCT FROM NEW.location
        OR OLD.unpaid_break_minutes IS DISTINCT FROM NEW.unpaid_break_minutes
        OR OLD.notes IS DISTINCT FROM NEW.notes) THEN
      INSERT INTO public.time_entry_audit
        (time_entry_id, employee_user_id, work_date, changed_by, change_type, old_values, new_values)
      VALUES
        (NEW.id, NEW.employee_user_id, NEW.work_date, auth.uid(), 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.time_entry_audit
      (time_entry_id, employee_user_id, work_date, changed_by, change_type, old_values, new_values)
    VALUES
      (OLD.id, OLD.employee_user_id, OLD.work_date, auth.uid(), 'DELETE', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_time_entry_change ON public.employee_time_entries;

CREATE TRIGGER trg_log_time_entry_change
AFTER INSERT OR UPDATE OR DELETE ON public.employee_time_entries
FOR EACH ROW EXECUTE FUNCTION public.log_time_entry_change();

COMMENT ON TABLE public.punch_events IS
  'Immutable log of every employee punch action (clock in/out, lunch). Captures IP, geolocation, and user agent for audit / erratic-hours detection.';
COMMENT ON TABLE public.time_entry_audit IS
  'Immutable audit trail of every insert/update/delete on employee_time_entries. Populated by trg_log_time_entry_change.';
