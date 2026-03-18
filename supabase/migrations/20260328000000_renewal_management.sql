-- Renewal Management System
-- Tables: renewal_upload_batches, customer_renewal_groups, renewal_policies, customer_consent
-- Supports XLSX upload of Allstate renewal reports, triage, consent + DNC tracking

-- ── Table 1: renewal_upload_batches ─────────────────────────────────────────
-- Tracks each upload for auditability.

CREATE TABLE IF NOT EXISTS renewal_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  uploaded_by uuid REFERENCES employees(id),
  filename text NOT NULL,
  row_count integer,
  rows_imported integer,
  rows_updated integer,
  rows_skipped integer,
  rows_errored integer,
  groups_created integer,
  groups_updated integer,
  error_log jsonb,
  report_download_date date,
  stale_upload boolean NOT NULL DEFAULT false,
  upload_date timestamptz NOT NULL DEFAULT now()
);

-- ── Table 2: customer_renewal_groups ────────────────────────────────────────
-- Groups multi-policy households by phone number for dedup and routing.

CREATE TABLE IF NOT EXISTS customer_renewal_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),

  -- Group key — phone is the grouping identifier
  customer_phone text NOT NULL,
  customer_name text,

  -- Aggregate financials (updated at upload time)
  total_current_premium numeric(12,2),
  total_renewal_premium numeric(12,2),
  policy_count integer NOT NULL DEFAULT 0,

  -- Routing
  ai_eligible boolean NOT NULL DEFAULT true,
  human_only boolean NOT NULL DEFAULT false,
  human_only_reason text CHECK (human_only_reason IN (
    'dnc', 'claim_activity', 'multi_date_conflict', 'premium_sanity',
    'stale_upload', 'amount_due', 'no_consent', 'attempt_cap', 'manual'
  )),

  -- Contact state (group-level)
  contact_attempts integer NOT NULL DEFAULT 0,
  last_contact_date timestamptz,
  last_contact_outcome text CHECK (last_contact_outcome IN (
    'no_answer', 'confirmed', 'hesitant', 'shopping',
    'escalated', 'left_voicemail', 'wrong_number', 'third_party_answer'
  )),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agency_id, customer_phone)
);

-- ── Table 3: renewal_policies ───────────────────────────────────────────────
-- Stores each policy renewal record uploaded from Allstate reports.

CREATE TABLE IF NOT EXISTS renewal_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),

  -- Policy identifiers
  policy_number text NOT NULL,
  policy_type text NOT NULL CHECK (policy_type IN (
    'auto', 'home', 'condo', 'renters', 'landlord', 'pup',
    'boat', 'manufactured', 'specialty_auto', 'other'
  )),

  -- Customer info
  customer_name text NOT NULL,
  customer_phone text,
  customer_email text,
  customer_address text,

  -- Renewal financials
  current_premium numeric(10,2),
  renewal_premium numeric(10,2),
  amount_due numeric(10,2),
  premium_change_pct numeric(6,2) GENERATED ALWAYS AS (
    CASE
      WHEN current_premium IS NOT NULL AND current_premium > 0
      THEN ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2)
      ELSE NULL
    END
  ) STORED,
  rate_decrease_flag boolean GENERATED ALWAYS AS (
    CASE
      WHEN current_premium IS NOT NULL AND current_premium > 0
        AND ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2) < 0
      THEN true
      ELSE false
    END
  ) STORED,
  premium_sanity_flag boolean NOT NULL DEFAULT false,

  -- Dates
  renewal_date date NOT NULL,
  upload_date timestamptz NOT NULL DEFAULT now(),

  -- Policy details
  drivers_on_policy text[],
  vehicles_on_policy text[],
  mortgagee text,
  eft_on_file boolean,
  multi_policy boolean DEFAULT false,
  option_package text,
  renewal_status_allstate text,
  customer_tenure_years integer,

  -- Triage status
  renewal_status text NOT NULL DEFAULT 'pending'
    CHECK (renewal_status IN (
      'pending', 'contacted', 'confirmed', 'at_risk',
      'escalated', 'lost', 'renewed'
    )),
  rate_shock_flag boolean GENERATED ALWAYS AS (
    CASE
      WHEN current_premium IS NOT NULL AND current_premium > 0
        AND ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2) >= 15
      THEN true
      ELSE false
    END
  ) STORED,
  priority_tier text GENERATED ALWAYS AS (
    CASE
      WHEN current_premium IS NOT NULL AND current_premium > 0 THEN
        CASE
          WHEN ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2) >= 20 THEN 'critical'
          WHEN ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2) >= 15 THEN 'high'
          WHEN ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2) >= 10 THEN 'medium'
          ELSE 'standard'
        END
      ELSE 'standard'
    END
  ) STORED,

  -- Routing
  human_only boolean NOT NULL DEFAULT false,
  human_only_reason text CHECK (human_only_reason IN (
    'dnc', 'claim_activity', 'multi_date_conflict', 'premium_sanity',
    'stale_upload', 'amount_due', 'no_consent', 'attempt_cap', 'manual'
  )),

  -- Claim flag
  claim_flag text NOT NULL DEFAULT 'none' CHECK (claim_flag IN ('none', 'open', 'recent')),
  claim_flag_set_by uuid REFERENCES employees(id),
  claim_flag_set_at timestamptz,
  claim_flag_cleared_at timestamptz,
  claim_flag_cleared_by uuid REFERENCES employees(id),

  -- Contact tracking
  contact_attempts integer NOT NULL DEFAULT 0,
  last_contact_date timestamptz,
  last_contact_outcome text CHECK (last_contact_outcome IN (
    'no_answer', 'confirmed', 'hesitant', 'shopping',
    'escalated', 'left_voicemail', 'wrong_number', 'third_party_answer'
  )),
  last_contact_channel text CHECK (last_contact_channel IN (
    'ai_voice', 'human_call', 'email'
  )),
  ai_transcript text,

  -- Human follow-up
  human_followup_required boolean NOT NULL DEFAULT false,
  followup_reason text CHECK (followup_reason IN (
    'rate_shock', 'shopping', 'no_response', 'eft_lapse',
    'multi_policy', 'hesitant', 'address_discrepancy',
    'amount_due', 'wrong_number', 'manual'
  )),
  assigned_to uuid REFERENCES employees(id),
  followup_notes text,
  followup_completed_at timestamptz,

  -- Group + upload metadata
  customer_group_id uuid REFERENCES customer_renewal_groups(id),
  upload_batch_id uuid REFERENCES renewal_upload_batches(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agency_id, policy_number, renewal_date)
);

-- ── Table 4: customer_consent ───────────────────────────────────────────────
-- Tracks auto-dial consent and DNC status per customer per agency.

CREATE TABLE IF NOT EXISTS customer_consent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),

  -- Customer identifiers
  customer_phone text NOT NULL,
  customer_name text,
  policy_numbers text[],

  -- Auto-dial / AI voice consent
  autodial_consent boolean NOT NULL DEFAULT false,
  autodial_consent_date timestamptz,
  autodial_consent_source text CHECK (autodial_consent_source IN (
    'inbound_call', 'email', 'service_interaction', 'manual', 'funnel'
  )),
  autodial_opt_out_date timestamptz,
  autodial_opt_out_channel text CHECK (autodial_opt_out_channel IN (
    'verbal', 'email', 'manual'
  )),

  -- DNC (Do Not Call) — legal compliance
  dnc boolean NOT NULL DEFAULT false,
  dnc_date timestamptz,
  dnc_source text CHECK (dnc_source IN (
    'verbal', 'email', 'manual', 'call_request', 'national_registry'
  )),
  dnc_notes text,
  dnc_removed_date timestamptz,
  dnc_removed_by uuid REFERENCES employees(id),

  -- Who collected consent
  consent_collected_by uuid REFERENCES employees(id),
  consent_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agency_id, customer_phone)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

-- renewal_policies
CREATE INDEX idx_renewal_policies_agency_id ON renewal_policies(agency_id);
CREATE INDEX idx_renewal_policies_renewal_date ON renewal_policies(renewal_date);
CREATE INDEX idx_renewal_policies_status ON renewal_policies(renewal_status);
CREATE INDEX idx_renewal_policies_priority ON renewal_policies(priority_tier);
CREATE INDEX idx_renewal_policies_followup ON renewal_policies(human_followup_required, assigned_to);
CREATE INDEX idx_renewal_policies_batch ON renewal_policies(upload_batch_id);
CREATE INDEX idx_renewal_policies_group ON renewal_policies(customer_group_id);
CREATE INDEX idx_renewal_policies_human_only ON renewal_policies(human_only) WHERE human_only = true;
CREATE INDEX idx_renewal_policies_claim ON renewal_policies(claim_flag) WHERE claim_flag != 'none';

-- customer_renewal_groups
CREATE INDEX idx_renewal_groups_agency ON customer_renewal_groups(agency_id);
CREATE INDEX idx_renewal_groups_phone ON customer_renewal_groups(customer_phone);
CREATE INDEX idx_renewal_groups_human_only ON customer_renewal_groups(agency_id, human_only) WHERE human_only = true;

-- customer_consent
CREATE INDEX idx_customer_consent_agency ON customer_consent(agency_id);
CREATE INDEX idx_customer_consent_phone ON customer_consent(customer_phone);
CREATE INDEX idx_customer_consent_autodial ON customer_consent(agency_id, autodial_consent)
  WHERE autodial_consent = true;
CREATE INDEX idx_customer_consent_dnc ON customer_consent(agency_id, dnc)
  WHERE dnc = true;

-- ── updated_at trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_renewal_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_renewal_policies_updated_at
  BEFORE UPDATE ON renewal_policies
  FOR EACH ROW EXECUTE FUNCTION update_renewal_updated_at();

CREATE TRIGGER trg_customer_consent_updated_at
  BEFORE UPDATE ON customer_consent
  FOR EACH ROW EXECUTE FUNCTION update_renewal_updated_at();

CREATE TRIGGER trg_customer_renewal_groups_updated_at
  BEFORE UPDATE ON customer_renewal_groups
  FOR EACH ROW EXECUTE FUNCTION update_renewal_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────

-- renewal_policies
ALTER TABLE renewal_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read their renewals"
  ON renewal_policies FOR SELECT
  USING (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

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
ALTER TABLE customer_renewal_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read their groups"
  ON customer_renewal_groups FOR SELECT
  USING (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

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
ALTER TABLE customer_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read consent records"
  ON customer_consent FOR SELECT
  USING (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agency members can insert consent"
  ON customer_consent FOR INSERT
  WITH CHECK (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agency members can update consent"
  ON customer_consent FOR UPDATE
  USING (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

-- renewal_upload_batches
ALTER TABLE renewal_upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent can read upload batches"
  ON renewal_upload_batches FOR SELECT
  USING (agency_id = (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agent can insert upload batches"
  ON renewal_upload_batches FOR INSERT
  WITH CHECK (agency_id IN (
    SELECT am.agency_id FROM agency_memberships am
    WHERE am.user_id = auth.uid() AND am.status = 'active' AND am.agency_role = 'agent'
  ));
