-- =============================================================================
-- Admin-Only Time Entries — Remove Employee Self-Service
-- =============================================================================
-- All time entry is done by Cameron (admin). Employees never log in to track
-- hours. This migration removes self-service RLS policies, the approval guard
-- trigger, and the approved column.

-- 1. Drop employee-facing RLS policies (employees won't write directly)
DROP POLICY IF EXISTS "read_own_time_entries" ON public.employee_time_entries;
DROP POLICY IF EXISTS "insert_own_time_entries" ON public.employee_time_entries;
DROP POLICY IF EXISTS "update_own_time_entries" ON public.employee_time_entries;

-- 2. Drop the approval guard trigger and function (no approval workflow)
DROP TRIGGER IF EXISTS trg_guard_approval ON public.employee_time_entries;
DROP FUNCTION IF EXISTS public.guard_approval();

-- 3. Drop the approved column (admin entry is immediately final)
ALTER TABLE public.employee_time_entries DROP COLUMN IF EXISTS approved;

-- Keep: calc_hours_worked() trigger, admin RLS policy, all indexes/constraints
