-- 031_employee_management.sql
-- Employee Management Module: employees table, employee_verifications table,
-- updated_at trigger, RLS policies, and indexes.

-- ── employees table ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,

  -- Identity
  first_name text NOT NULL,
  last_name text NOT NULL,
  preferred_name text,

  -- Contact
  personal_email text,
  cell_phone text,
  home_phone text,

  -- Address
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  zip_code text,

  -- Allstate / Carrier
  allstate_id text,

  -- Role & Employment
  role_type text NOT NULL DEFAULT 'cs_rep'
    CHECK (role_type IN ('cs_rep', 'producer', 'admin')),
  employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'terminated', 'on_leave')),
  hire_date date,
  termination_date date,
  termination_reason text,

  -- Licensing
  is_licensed boolean NOT NULL DEFAULT false,
  license_verified_date date,
  professional_designations text[],
  years_insurance_experience int,
  years_commercial_experience int,
  highest_education text,

  -- Verification
  last_verified_at timestamptz,
  verified_by uuid,
  verification_alert_sent_at timestamptz,

  -- Auth linkage (optional)
  auth_user_id uuid,

  -- RC name matching
  rc_display_name text,

  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_employees_org ON public.employees (org_id);
CREATE INDEX idx_employees_org_status ON public.employees (org_id, employment_status);
CREATE INDEX idx_employees_rc_name ON public.employees (org_id, rc_display_name);
CREATE UNIQUE INDEX idx_employees_allstate_id ON public.employees (org_id, allstate_id)
  WHERE allstate_id IS NOT NULL;

-- RLS: Admin only
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_employees"
ON public.employees
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.platform_role IN ('platform_admin', 'platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);

-- ── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_employees_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_employees_updated
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.update_employees_timestamp();

-- ── employee_verifications table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.employee_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id),
  verified_by uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  changes_made text
);

CREATE INDEX idx_verifications_employee ON public.employee_verifications (employee_id, verified_at DESC);

ALTER TABLE public.employee_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_verifications"
ON public.employee_verifications
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.platform_role IN ('platform_admin', 'platform_master_admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.platform_role IN ('platform_admin', 'platform_master_admin')
  )
);
