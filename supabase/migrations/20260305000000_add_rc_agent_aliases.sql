-- Migration: Add rc_agent_aliases table for many-to-one agent name mapping
-- Purpose: Allow admins to map RingCentral display names (aliases) to employees,
-- resolving name drift without editing core employee identity fields.

-- ── Table ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rc_agent_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,

  -- Canonical normalized key (lowercased, whitespace collapsed, punctuation stripped)
  alias_key text NOT NULL,
  -- The raw cleaned agent string as it appeared in the upload
  alias_display text NOT NULL,

  -- Points to the same ID domain stored in rc_call_log.employee_user_id
  -- (employees.auth_user_id for linked users, employees.id for unlinked)
  employee_user_id uuid NOT NULL,

  -- Audit / provenance
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto', 'import')),
  active boolean NOT NULL DEFAULT true
);

-- Only one active alias per normalized key per org
CREATE UNIQUE INDEX idx_rc_agent_aliases_key
  ON rc_agent_aliases (org_id, alias_key) WHERE active = true;

-- Fast lookup by employee for admin UI
CREATE INDEX idx_rc_agent_aliases_employee
  ON rc_agent_aliases (org_id, employee_user_id) WHERE active = true;

-- ── RLS ──────────────────────────────────────────────────────────────────────────

ALTER TABLE rc_agent_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE rc_agent_aliases FORCE ROW LEVEL SECURITY;

-- Admin-only access (same pattern as rc_call_log)
CREATE POLICY "rc_agent_aliases_select_admin"
  ON rc_agent_aliases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

CREATE POLICY "rc_agent_aliases_insert_admin"
  ON rc_agent_aliases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

CREATE POLICY "rc_agent_aliases_update_admin"
  ON rc_agent_aliases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );

CREATE POLICY "rc_agent_aliases_delete_admin"
  ON rc_agent_aliases FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = (select auth.uid())
        AND p.is_platform_user = true
        AND p.platform_role IN ('platform_admin', 'platform_master_admin')
    )
  );
