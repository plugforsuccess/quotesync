-- =============================================================================
-- CS Performance Dashboard v2 — New tables + RC column additions
-- =============================================================================

-- 1. Add new columns to rc_performance_data for Efficiency & Quality metrics
ALTER TABLE public.rc_performance_data
  ADD COLUMN IF NOT EXISTS answered_calls int NOT NULL DEFAULT 0
    CHECK (answered_calls >= 0 AND answered_calls <= 10000),
  ADD COLUMN IF NOT EXISTS missed_calls int NOT NULL DEFAULT 0
    CHECK (missed_calls >= 0 AND missed_calls <= 10000),
  ADD COLUMN IF NOT EXISTS avg_hold_time_minutes numeric(6,2) NOT NULL DEFAULT 0
    CHECK (avg_hold_time_minutes >= 0 AND avg_hold_time_minutes <= 1440),
  ADD COLUMN IF NOT EXISTS avg_speed_of_answer_seconds numeric(8,2) NOT NULL DEFAULT 0
    CHECK (avg_speed_of_answer_seconds >= 0),
  ADD COLUMN IF NOT EXISTS transfers int NOT NULL DEFAULT 0
    CHECK (transfers >= 0 AND transfers <= 10000),
  ADD COLUMN IF NOT EXISTS total_handle_time_minutes numeric(8,2) NOT NULL DEFAULT 0
    CHECK (total_handle_time_minutes >= 0 AND total_handle_time_minutes <= 10080);


-- =============================================================================
-- 2. Per-Employee Performance Targets
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cs_performance_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,

  -- Activity targets
  outbound_calls_weekly int NOT NULL DEFAULT 40,
  total_calls_weekly int NOT NULL DEFAULT 75,
  avg_handle_time_min_low numeric(4,1) NOT NULL DEFAULT 5.0,
  avg_handle_time_min_high numeric(4,1) NOT NULL DEFAULT 8.0,
  avg_calls_per_day int NOT NULL DEFAULT 15,

  -- Efficiency & Quality targets
  answer_rate_pct numeric(4,1) NOT NULL DEFAULT 95.0,
  avg_speed_of_answer_sec int NOT NULL DEFAULT 20,
  avg_hold_time_min numeric(4,1) NOT NULL DEFAULT 2.0,
  transfer_rate_pct numeric(4,1) NOT NULL DEFAULT 15.0,
  missed_call_rate_pct numeric(4,1) NOT NULL DEFAULT 5.0,

  -- Grade thresholds (outbound)
  grade_a_outbound int NOT NULL DEFAULT 60,
  grade_b_outbound int NOT NULL DEFAULT 40,
  grade_c_outbound int NOT NULL DEFAULT 30,

  -- Grade thresholds (answer rate)
  grade_a_answer_rate numeric(4,1) NOT NULL DEFAULT 98.0,
  grade_b_answer_rate numeric(4,1) NOT NULL DEFAULT 95.0,
  grade_c_answer_rate numeric(4,1) NOT NULL DEFAULT 90.0,

  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (employee_user_id, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_cs_targets_employee
  ON public.cs_performance_targets (employee_user_id, effective_date DESC);

ALTER TABLE public.cs_performance_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_cs_targets"
ON public.cs_performance_targets
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


-- =============================================================================
-- 3. Outbound Call Type Breakdown (manual entry)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cs_outbound_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  week_start date NOT NULL,
  renewal int NOT NULL DEFAULT 0 CHECK (renewal >= 0),
  cross_sell int NOT NULL DEFAULT 0 CHECK (cross_sell >= 0),
  billing int NOT NULL DEFAULT 0 CHECK (billing >= 0),
  save_attempt int NOT NULL DEFAULT 0 CHECK (save_attempt >= 0),
  winback int NOT NULL DEFAULT 0 CHECK (winback >= 0),
  other int NOT NULL DEFAULT 0 CHECK (other >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, week_start)
);

ALTER TABLE public.cs_outbound_breakdown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_outbound_breakdown"
ON public.cs_outbound_breakdown
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


-- =============================================================================
-- 4. Manual Proactivity Assessments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cs_proactivity_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  week_start date NOT NULL,
  followup_notes_logged boolean NOT NULL DEFAULT false,
  queue_participation boolean NOT NULL DEFAULT false,
  admin_notes text,
  updated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_user_id, week_start)
);

ALTER TABLE public.cs_proactivity_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_proactivity_manual"
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
