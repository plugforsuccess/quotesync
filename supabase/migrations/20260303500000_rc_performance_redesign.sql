-- =============================================================================
-- RC Performance Data Redesign — Efficiency & Quality metrics
-- =============================================================================
-- RingCentral Performance Reports do NOT export logged-in time, available time,
-- or offline time. This migration replaces the old availability columns with
-- the metrics that ARE available in the User Performance XLSX export:
-- answer rate, speed of answer, hold time, transfer rate, missed call rate, etc.

-- 1. Drop old availability columns that RC doesn't provide
ALTER TABLE public.rc_performance_data
  DROP COLUMN IF EXISTS talk_time_minutes,
  DROP COLUMN IF EXISTS logged_in_minutes,
  DROP COLUMN IF EXISTS available_minutes,
  DROP COLUMN IF EXISTS offline_minutes;

-- 2. Add new columns matching the actual RC User Performance export
ALTER TABLE public.rc_performance_data
  ADD COLUMN IF NOT EXISTS answered_calls int NOT NULL DEFAULT 0
    CHECK (answered_calls >= 0 AND answered_calls <= 10000),
  ADD COLUMN IF NOT EXISTS missed_calls int NOT NULL DEFAULT 0
    CHECK (missed_calls >= 0 AND missed_calls <= 10000),
  ADD COLUMN IF NOT EXISTS missed_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (missed_pct >= 0 AND missed_pct <= 100),
  ADD COLUMN IF NOT EXISTS transfers int NOT NULL DEFAULT 0
    CHECK (transfers >= 0 AND transfers <= 10000),
  ADD COLUMN IF NOT EXISTS transfer_pct numeric(5,2) NOT NULL DEFAULT 0
    CHECK (transfer_pct >= 0 AND transfer_pct <= 100),
  ADD COLUMN IF NOT EXISTS voicemails int NOT NULL DEFAULT 0
    CHECK (voicemails >= 0 AND voicemails <= 10000),
  ADD COLUMN IF NOT EXISTS hold_count int NOT NULL DEFAULT 0
    CHECK (hold_count >= 0 AND hold_count <= 10000),
  ADD COLUMN IF NOT EXISTS total_handle_time_minutes numeric(8,2) NOT NULL DEFAULT 0
    CHECK (total_handle_time_minutes >= 0 AND total_handle_time_minutes <= 10080),
  ADD COLUMN IF NOT EXISTS avg_handle_time_in_minutes numeric(6,2) NOT NULL DEFAULT 0
    CHECK (avg_handle_time_in_minutes >= 0 AND avg_handle_time_in_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS avg_handle_time_out_minutes numeric(6,2) NOT NULL DEFAULT 0
    CHECK (avg_handle_time_out_minutes >= 0 AND avg_handle_time_out_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS avg_hold_time_minutes numeric(6,2) NOT NULL DEFAULT 0
    CHECK (avg_hold_time_minutes >= 0 AND avg_hold_time_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS avg_speed_of_answer_seconds numeric(8,2) NOT NULL DEFAULT 0
    CHECK (avg_speed_of_answer_seconds >= 0 AND avg_speed_of_answer_seconds <= 86400),
  ADD COLUMN IF NOT EXISTS avg_calls_per_day numeric(6,2) NOT NULL DEFAULT 0
    CHECK (avg_calls_per_day >= 0 AND avg_calls_per_day <= 2000),
  ADD COLUMN IF NOT EXISTS total_call_sessions int NOT NULL DEFAULT 0
    CHECK (total_call_sessions >= 0 AND total_call_sessions <= 10000);

-- 3. Add proactivity manual fields table for Cameron's weekly review checkboxes
CREATE TABLE IF NOT EXISTS public.cs_proactivity_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  week_start date NOT NULL,
  follow_up_notes_logged boolean NOT NULL DEFAULT false,
  queue_participation boolean NOT NULL DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_proactivity_org_week
  ON public.cs_proactivity_manual (org_id, week_start);

ALTER TABLE public.cs_proactivity_manual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_all_proactivity" ON public.cs_proactivity_manual;
CREATE POLICY "admin_all_proactivity"
ON public.cs_proactivity_manual
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
