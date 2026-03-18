-- AI Voice Renewal Calling — Bland.ai Integration
-- Adds followup_due_by, final_outcome fields to renewal_policies
-- Creates ai_call_log table for call metrics and audit trail
-- Adds group_contact_status to customer_renewal_groups

-- ── Migration 1: followup_due_by + final_outcome on renewal_policies ────────

ALTER TABLE renewal_policies
  ADD COLUMN IF NOT EXISTS followup_due_by timestamptz,
  ADD COLUMN IF NOT EXISTS followup_due_by_reason text,
  ADD COLUMN IF NOT EXISTS final_outcome text
    CHECK (final_outcome IN ('renewed', 'lost', 'unknown')),
  ADD COLUMN IF NOT EXISTS final_outcome_notes text,
  ADD COLUMN IF NOT EXISTS final_outcome_set_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS final_outcome_set_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_renewal_policies_due_by
  ON renewal_policies(followup_due_by)
  WHERE followup_due_by IS NOT NULL AND followup_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_renewal_policies_final_outcome
  ON renewal_policies(agency_id, final_outcome)
  WHERE final_outcome IS NOT NULL;

-- ── Migration 2: group_contact_status on customer_renewal_groups ────────────

ALTER TABLE customer_renewal_groups
  ADD COLUMN IF NOT EXISTS group_contact_status text
    CHECK (group_contact_status IN (
      'pending', 'contacted', 'confirmed', 'escalated', 'at_risk'
    )),
  ADD COLUMN IF NOT EXISTS total_premium_change numeric(12,2);

-- ── Migration 3: ai_call_log ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_call_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  policy_id uuid NOT NULL REFERENCES renewal_policies(id),
  bland_call_id text NOT NULL UNIQUE,
  call_outcome text,
  call_length_seconds integer,
  estimated_cost_usd numeric(6,4),
  callback_confirmed boolean DEFAULT false,
  consent_captured boolean DEFAULT false,
  autodial_consent_result boolean,
  opt_out boolean DEFAULT false,
  assigned_to uuid REFERENCES employees(id),
  followup_reason text,
  called_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_log_agency ON ai_call_log(agency_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_policy ON ai_call_log(policy_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_log_called_at ON ai_call_log(called_at);

ALTER TABLE ai_call_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent reads call log" ON ai_call_log FOR SELECT
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Service role inserts call log" ON ai_call_log FOR INSERT
  WITH CHECK (true);

-- Webhook retries use upsert (INSERT ... ON CONFLICT UPDATE), which requires
-- both INSERT and UPDATE policies. Service role bypasses RLS, but add UPDATE
-- policy for defense-in-depth in case service role is ever removed.
CREATE POLICY "Service role updates call log" ON ai_call_log FOR UPDATE
  USING (true);

-- ── Migration 4: Fix broken RLS policies from 20260328000000 ─────────────────
-- The original renewal_management migration references employees.user_id and
-- employees.agency_id, which don't exist. The correct columns are
-- employees.auth_user_id and employees.org_id respectively.
-- Also: role lives on agency_memberships.agency_role, not on employees.

-- renewal_policies
DROP POLICY IF EXISTS "Agency members can read their renewals" ON renewal_policies;
DROP POLICY IF EXISTS "Agent role can insert renewals" ON renewal_policies;
DROP POLICY IF EXISTS "Agent role can update renewals" ON renewal_policies;

CREATE POLICY "Agency members can read their renewals"
  ON renewal_policies FOR SELECT
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Agent role can insert renewals"
  ON renewal_policies FOR INSERT
  WITH CHECK (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));

CREATE POLICY "Agent role can update renewals"
  ON renewal_policies FOR UPDATE
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));

-- customer_renewal_groups
DROP POLICY IF EXISTS "Agency members can read their groups" ON customer_renewal_groups;
DROP POLICY IF EXISTS "Agent role can insert groups" ON customer_renewal_groups;
DROP POLICY IF EXISTS "Agent role can update groups" ON customer_renewal_groups;

CREATE POLICY "Agency members can read their groups"
  ON customer_renewal_groups FOR SELECT
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Agent role can insert groups"
  ON customer_renewal_groups FOR INSERT
  WITH CHECK (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));

CREATE POLICY "Agent role can update groups"
  ON customer_renewal_groups FOR UPDATE
  USING (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));

-- customer_consent
DROP POLICY IF EXISTS "Agency members can read consent records" ON customer_consent;
DROP POLICY IF EXISTS "Agency members can insert consent" ON customer_consent;
DROP POLICY IF EXISTS "Agency members can update consent" ON customer_consent;

CREATE POLICY "Agency members can read consent records"
  ON customer_consent FOR SELECT
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Agency members can insert consent"
  ON customer_consent FOR INSERT
  WITH CHECK (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Agency members can update consent"
  ON customer_consent FOR UPDATE
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

-- renewal_upload_batches
DROP POLICY IF EXISTS "Agent can read upload batches" ON renewal_upload_batches;
DROP POLICY IF EXISTS "Agent can insert upload batches" ON renewal_upload_batches;

CREATE POLICY "Agent can read upload batches"
  ON renewal_upload_batches FOR SELECT
  USING (agency_id = (SELECT org_id FROM employees WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE POLICY "Agent can insert upload batches"
  ON renewal_upload_batches FOR INSERT
  WITH CHECK (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));

-- ── Migration 5: autodial_consent_source enum update ────────────────────────
-- Add 'ai_voice' as a valid consent source for AI call consent capture

ALTER TABLE customer_consent
  DROP CONSTRAINT IF EXISTS customer_consent_autodial_consent_source_check;

ALTER TABLE customer_consent
  ADD CONSTRAINT customer_consent_autodial_consent_source_check
  CHECK (autodial_consent_source IN (
    'inbound_call', 'email', 'service_interaction', 'manual', 'funnel', 'ai_voice'
  ));
