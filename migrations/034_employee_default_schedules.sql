-- 034_employee_default_schedules.sql
-- Add per-employee default schedule columns to the employees table.
-- These defaults pre-fill the Attendance page for each employee.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS default_start_time time DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS default_lunch_out time DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS default_lunch_in time DEFAULT '13:00',
  ADD COLUMN IF NOT EXISTS default_end_time time DEFAULT '18:00';

COMMENT ON COLUMN public.employees.default_start_time IS 'Default work start time for attendance pre-fill';
COMMENT ON COLUMN public.employees.default_lunch_out IS 'Default lunch break start for attendance pre-fill';
COMMENT ON COLUMN public.employees.default_lunch_in IS 'Default lunch break end for attendance pre-fill';
COMMENT ON COLUMN public.employees.default_end_time IS 'Default work end time for attendance pre-fill';
