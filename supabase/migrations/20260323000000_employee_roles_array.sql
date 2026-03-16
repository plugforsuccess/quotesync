-- ── Add roles TEXT[] column alongside role_type ──────────────────────────────
-- We add the new column first, backfill from role_type, then drop role_type.
-- This is done in one migration to avoid intermediate broken states.

-- 1. Add roles array column
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS roles TEXT[] NOT NULL DEFAULT ARRAY['service']::TEXT[];

-- 2. Backfill from existing role_type values
--    'producer' → 'sales' (rename)
--    'service' → 'service'
--    'admin' → 'admin'
UPDATE public.employees SET roles =
  CASE role_type
    WHEN 'producer' THEN ARRAY['sales']::TEXT[]
    WHEN 'service'  THEN ARRAY['service']::TEXT[]
    WHEN 'admin'    THEN ARRAY['admin']::TEXT[]
    ELSE                 ARRAY['service']::TEXT[]
  END;

-- 3. Add CHECK constraint on array elements
ALTER TABLE public.employees
  ADD CONSTRAINT employees_roles_check
  CHECK (roles <@ ARRAY['service', 'sales', 'admin']::TEXT[]);
  -- <@ means "is contained by" — every element in roles must be in the allowed set

-- 4. Add GIN index for efficient array contains queries
CREATE INDEX IF NOT EXISTS employees_roles_gin_idx
  ON public.employees USING GIN (roles);

-- 5. Drop old role_type column and constraint
ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_role_type_check;
ALTER TABLE public.employees
  DROP COLUMN IF EXISTS role_type;

-- 6. Update seed migration reference (comment only — actual seed file updated separately)
-- Tracy Peacock: roles = ['service']
-- Cameron Wiley: roles = ['admin']
