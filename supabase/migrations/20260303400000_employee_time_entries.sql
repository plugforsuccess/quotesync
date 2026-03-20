-- =============================================================================
-- Employee Time Entries — Time & Attendance Module
-- =============================================================================

-- 1. Create Table
CREATE TABLE IF NOT EXISTS public.employee_time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  week_start date NOT NULL,
  work_date date NOT NULL,
  location text NOT NULL CHECK (location IN ('OFFICE','WFH')),
  code text NOT NULL CHECK (code IN ('REG','WFH','SICK','SICK_PART','PTO','APPT','EARLY')),
  start_time time,
  lunch_out time,
  lunch_in time,
  end_time time,
  unpaid_break_minutes int NOT NULL DEFAULT 0 CHECK (unpaid_break_minutes >= 0),
  notes text,
  hours_worked numeric(5,2),
  approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Create Indexes
CREATE INDEX IF NOT EXISTS idx_time_entries_org_week
  ON public.employee_time_entries (org_id, week_start);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_week
  ON public.employee_time_entries (employee_user_id, week_start);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_employee_work_date
  ON public.employee_time_entries (employee_user_id, work_date);

-- 3. Trigger Function: Auto-Calculate hours_worked
-- SECURITY DEFINER ensures this runs with the function owner's privileges,
-- avoiding RLS recursion issues when called from employee sessions.
CREATE OR REPLACE FUNCTION public.calc_hours_worked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  start_ts interval;
  end_ts interval;
  lunch interval := interval '0';
  gross interval;
  break interval;
BEGIN
  IF new.start_time IS NULL OR new.end_time IS NULL THEN
    new.hours_worked := NULL;
    RETURN new;
  END IF;

  start_ts := new.start_time::interval;
  end_ts := new.end_time::interval;

  -- handle overnight edge case
  IF end_ts < start_ts THEN
    end_ts := end_ts + interval '24 hours';
  END IF;

  IF new.lunch_out IS NOT NULL AND new.lunch_in IS NOT NULL THEN
    lunch := (new.lunch_in::interval - new.lunch_out::interval);
    IF lunch < interval '0' THEN
      lunch := interval '0';
    END IF;
  END IF;

  break := make_interval(mins => coalesce(new.unpaid_break_minutes, 0));
  gross := (end_ts - start_ts) - lunch - break;

  IF gross < interval '0' THEN
    gross := interval '0';
  END IF;

  new.hours_worked := round((extract(epoch FROM gross) / 3600)::numeric, 2);
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_hours_worked ON public.employee_time_entries;

CREATE TRIGGER trg_calc_hours_worked
BEFORE INSERT OR UPDATE ON public.employee_time_entries
FOR EACH ROW EXECUTE FUNCTION public.calc_hours_worked();

-- 4. Enable RLS + Create Policies
ALTER TABLE public.employee_time_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_time_entries" ON public.employee_time_entries;
CREATE POLICY "read_own_time_entries"
ON public.employee_time_entries
FOR SELECT
USING (auth.uid() = employee_user_id);

DROP POLICY IF EXISTS "insert_own_time_entries" ON public.employee_time_entries;
CREATE POLICY "insert_own_time_entries"
ON public.employee_time_entries
FOR INSERT
WITH CHECK (auth.uid() = employee_user_id);

DROP POLICY IF EXISTS "update_own_time_entries" ON public.employee_time_entries;
CREATE POLICY "update_own_time_entries"
ON public.employee_time_entries
FOR UPDATE
USING (auth.uid() = employee_user_id)
WITH CHECK (auth.uid() = employee_user_id);

-- Admin policy: platform admins can access all entries
-- Uses the profiles table is_platform_user + platform_role pattern
DROP POLICY IF EXISTS "admin_all_time_entries" ON public.employee_time_entries;
CREATE POLICY "admin_all_time_entries"
ON public.employee_time_entries
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);

-- 5. Guard Trigger: Prevent employees from self-approving their own entries
-- Silently reverts `approved` to its previous value if the updater is the
-- employee themselves (i.e. not an admin). Admins bypass this via the
-- profiles-table subquery.
-- SECURITY DEFINER ensures the profiles SELECT always succeeds regardless
-- of the calling user's RLS context on the profiles table.
CREATE OR REPLACE FUNCTION public.guard_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.approved IS DISTINCT FROM OLD.approved
    AND auth.uid() = NEW.employee_user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  THEN
    NEW.approved := OLD.approved;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_approval ON public.employee_time_entries;

CREATE TRIGGER trg_guard_approval
BEFORE UPDATE ON public.employee_time_entries
FOR EACH ROW EXECUTE FUNCTION public.guard_approval();

-- =============================================================================
-- RingCentral Performance Data — CS Performance Dashboard
-- =============================================================================

-- Store uploaded RingCentral weekly performance data
CREATE TABLE IF NOT EXISTS public.rc_performance_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  employee_name text NOT NULL,
  week_start date NOT NULL,
  -- Activity metrics (Section A) — bounds: max 168 hrs/week = 10080 min
  total_calls int NOT NULL DEFAULT 0 CHECK (total_calls >= 0 AND total_calls <= 10000),
  inbound_calls int NOT NULL DEFAULT 0 CHECK (inbound_calls >= 0 AND inbound_calls <= 10000),
  outbound_calls int NOT NULL DEFAULT 0 CHECK (outbound_calls >= 0 AND outbound_calls <= 10000),
  talk_time_minutes numeric(8,2) NOT NULL DEFAULT 0 CHECK (talk_time_minutes >= 0 AND talk_time_minutes <= 10080),
  avg_handle_time_minutes numeric(6,2) NOT NULL DEFAULT 0 CHECK (avg_handle_time_minutes >= 0 AND avg_handle_time_minutes <= 1440),
  -- Availability metrics (Section B)
  logged_in_minutes numeric(8,2) NOT NULL DEFAULT 0 CHECK (logged_in_minutes >= 0 AND logged_in_minutes <= 10080),
  available_minutes numeric(8,2) NOT NULL DEFAULT 0 CHECK (available_minutes >= 0 AND available_minutes <= 10080),
  offline_minutes numeric(8,2) NOT NULL DEFAULT 0 CHECK (offline_minutes >= 0 AND offline_minutes <= 10080),
  -- Daily breakdown for proactivity checks (JSON array of daily stats)
  daily_breakdown jsonb,
  -- Upload metadata
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_rc_perf_org_week
  ON public.rc_performance_data (org_id, week_start);

CREATE INDEX IF NOT EXISTS idx_rc_perf_employee_week
  ON public.rc_performance_data (employee_user_id, week_start);

ALTER TABLE public.rc_performance_data ENABLE ROW LEVEL SECURITY;

-- Admin-only access for RC data
DROP POLICY IF EXISTS "admin_all_rc_data" ON public.rc_performance_data;
CREATE POLICY "admin_all_rc_data"
ON public.rc_performance_data
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.is_platform_user = true
      AND p.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);
