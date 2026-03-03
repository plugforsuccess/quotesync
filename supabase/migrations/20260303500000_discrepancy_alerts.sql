-- Migration: discrepancy_alerts table
-- Stores server-detected discrepancy alerts for Slack notifications and in-app badge counts.
-- Supports deduplication (unique per employee+week+type+date) and resolution tracking.

CREATE TABLE IF NOT EXISTS public.discrepancy_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  employee_user_id uuid NOT NULL,
  week_start date NOT NULL,
  alert_date date,                -- specific day (for daily alerts like zero_outbound)
  alert_type text NOT NULL CHECK (alert_type IN (
    'hours_mismatch', 'office_offline', 'zero_outbound',
    'low_utilization', 'warn_utilization', 'frequent_absence',
    'low_daily_outbound'
  )),
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  message text NOT NULL,          -- human-readable description

  -- Resolution tracking
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid,               -- admin who resolved it
  resolution_notes text,

  -- Notification tracking
  slack_sent boolean NOT NULL DEFAULT false,
  slack_sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Deduplication: one alert per type per employee per day
  UNIQUE (employee_user_id, week_start, alert_type, alert_date)
);

-- Fast lookup for unresolved alerts (nav badge count)
CREATE INDEX idx_alerts_unresolved
  ON public.discrepancy_alerts (org_id, resolved, created_at DESC)
  WHERE resolved = false;

-- Lookup by employee + week (dashboard view)
CREATE INDEX idx_alerts_employee_week
  ON public.discrepancy_alerts (employee_user_id, week_start);

-- Enable RLS
ALTER TABLE public.discrepancy_alerts ENABLE ROW LEVEL SECURITY;

-- Admin-only access (same pattern as rc_performance_data)
CREATE POLICY "admin_all_alerts"
ON public.discrepancy_alerts
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.platform_role IN ('platform_master_admin', 'platform_admin')
  )
);
