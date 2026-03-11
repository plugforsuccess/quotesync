-- Add punch_pin to employees for PIN-based clock in/out at /punch
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS punch_pin CHAR(4)
    CHECK (punch_pin ~ '^\d{4}$');

-- Unique PIN per org so two employees in same org can't share a PIN
CREATE UNIQUE INDEX IF NOT EXISTS employees_org_pin_idx
  ON public.employees (org_id, punch_pin)
  WHERE punch_pin IS NOT NULL;

COMMENT ON COLUMN public.employees.punch_pin IS '4-digit employee punch PIN for /punch clock-in page';
