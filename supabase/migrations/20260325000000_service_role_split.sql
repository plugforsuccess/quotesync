-- 1. Update roles constraint to include new role values
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_roles_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_roles_check
  CHECK (roles <@ ARRAY['service_inbound', 'service_outbound', 'service', 'sales', 'admin']::TEXT[]);
-- Note: 'service' kept for backward compatibility during migration

-- 2. Migrate existing 'service' rows
-- Tracy → service_inbound (handles inbound)
-- Any other service employees → service_inbound by default
-- Nathan will be inserted fresh as service_outbound
UPDATE public.employees
  SET roles = ARRAY['service_inbound']::TEXT[]
  WHERE 'service' = ANY(roles)
  AND 'service_outbound' != ALL(roles);

-- 3. Add opened_by_id and closed_by_id to pending_cancel_events
ALTER TABLE public.pending_cancel_events
  ADD COLUMN IF NOT EXISTS opened_by_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_id  UUID REFERENCES employees(id) ON DELETE SET NULL;

-- 4. Add opened_by_id and closed_by_id to renewal_events
ALTER TABLE public.renewal_events
  ADD COLUMN IF NOT EXISTS opened_by_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_by_id  UUID REFERENCES employees(id) ON DELETE SET NULL;

-- 5. Backfill opened_by_id from first attempt log for pending_cancel_events
-- Sets opened_by_id to whoever logged the first attempt on each case
UPDATE public.pending_cancel_events pc
SET opened_by_id = (
  SELECT a.employee_id
  FROM public.pending_cancel_attempts a
  WHERE a.pending_cancel_event_id = pc.id
  ORDER BY a.attempted_at ASC
  LIMIT 1
)
WHERE pc.opened_by_id IS NULL;

-- 6. Backfill opened_by_id from first attempt log for renewal_events
UPDATE public.renewal_events re
SET opened_by_id = (
  SELECT a.employee_id
  FROM public.renewal_attempts a
  WHERE a.renewal_event_id = re.id
  ORDER BY a.attempted_at ASC
  LIMIT 1
)
WHERE re.opened_by_id IS NULL;

-- 7. Backfill closed_by_id = assigned_to_id for already-resolved cases
-- Best approximation — whoever was assigned when it resolved
UPDATE public.pending_cancel_events
  SET closed_by_id = assigned_to_id
  WHERE status IN ('saved', 'lost', 'cancelled', 'auto_resolved', 'requested_cancellation')
  AND closed_by_id IS NULL
  AND assigned_to_id IS NOT NULL;

UPDATE public.renewal_events
  SET closed_by_id = assigned_to_id
  WHERE status IN ('confirmed', 'lost', 'auto_resolved', 'unreachable')
  AND closed_by_id IS NULL
  AND assigned_to_id IS NOT NULL;
