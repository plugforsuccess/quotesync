-- Renewal Management System
-- Tables: renewal_upload_batches, renewal_policies, customer_consent
-- Supports CSV upload of Allstate renewal reports, triage, consent tracking

-- ── Table 1: renewal_upload_batches ─────────────────────────────────────────
-- Tracks each CSV upload for auditability. Created first so renewal_policies
-- can reference upload_batch_id.

CREATE TABLE renewal_upload_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES agencies(id),
  uploaded_by uuid REFERENCES employees(id),
  filename text NOT NULL,
  row_count integer,
  rows_imported integer,
  rows_skipped integer,
  rows_errored integer,
  error_log jsonb,
  upload_date timestamptz NOT NULL DEFAULT now()
);

-- ── Table 2: renewal_policies ───────────────────────────────────────────────
-- Stores each policy renewal record uploaded from Allstate reports.

CREATE TABLE renewal_policies (
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
  premium_change_pct numeric(6,2) GENERATED ALWAYS AS (
    CASE
      WHEN current_premium IS NOT NULL AND current_premium > 0
      THEN ROUND(((renewal_premium - current_premium) / current_premium) * 100, 2)
      ELSE NULL
    END
  ) STORED,

  -- Dates
  renewal_date date NOT NULL,
  upload_date timestamptz NOT NULL DEFAULT now(),

  -- Policy details
  drivers_on_policy text[],
  vehicles_on_policy text[],
  mortgagee text,
  eft_on_file boolean,
  multi_policy boolean DEFAULT false,

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

  -- Contact tracking
  contact_attempts integer NOT NULL DEFAULT 0,
  last_contact_date timestamptz,
  last_contact_outcome text CHECK (last_contact_outcome IN (
    'no_answer', 'confirmed', 'hesitant', 'shopping',
    'escalated', 'left_voicemail', 'wrong_number'
  )),
  last_contact_channel text CHECK (last_contact_channel IN (
    'ai_voice', 'human_call', 'email'
  )),
  ai_transcript text,

  -- Human follow-up
  human_followup_required boolean NOT NULL DEFAULT false,
  followup_reason text CHECK (followup_reason IN (
    'rate_shock', 'shopping', 'no_response', 'eft_lapse',
    'single_policy', 'prior_claim', 'hesitant', 'manual'
  )),
  assigned_to uuid REFERENCES employees(id),
  followup_notes text,
  followup_completed_at timestamptz,

  -- Upload metadata
  upload_batch_id uuid REFERENCES renewal_upload_batches(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agency_id, policy_number, renewal_date)
);

-- ── Table 3: customer_consent ───────────────────────────────────────────────
-- Tracks auto-dial consent per customer per agency.

CREATE TABLE customer_consent (
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

  -- Who collected it
  consent_collected_by uuid REFERENCES employees(id),
  consent_notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(agency_id, customer_phone)
);

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_renewal_policies_agency_id ON renewal_policies(agency_id);
CREATE INDEX idx_renewal_policies_renewal_date ON renewal_policies(renewal_date);
CREATE INDEX idx_renewal_policies_status ON renewal_policies(renewal_status);
CREATE INDEX idx_renewal_policies_priority ON renewal_policies(priority_tier);
CREATE INDEX idx_renewal_policies_followup ON renewal_policies(human_followup_required, assigned_to);
CREATE INDEX idx_renewal_policies_batch ON renewal_policies(upload_batch_id);

CREATE INDEX idx_customer_consent_agency ON customer_consent(agency_id);
CREATE INDEX idx_customer_consent_phone ON customer_consent(customer_phone);
CREATE INDEX idx_customer_consent_autodial ON customer_consent(agency_id, autodial_consent)
  WHERE autodial_consent = true;

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

-- ── Row Level Security ──────────────────────────────────────────────────────

-- renewal_policies
ALTER TABLE renewal_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read their renewals"
  ON renewal_policies FOR SELECT
  USING (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agent role can insert renewals"
  ON renewal_policies FOR INSERT
  WITH CHECK (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() AND role IN ('agent') LIMIT 1
  ));

CREATE POLICY "Agent role can update renewals"
  ON renewal_policies FOR UPDATE
  USING (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() AND role IN ('agent') LIMIT 1
  ));

-- customer_consent
ALTER TABLE customer_consent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agency members can read consent records"
  ON customer_consent FOR SELECT
  USING (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agency members can insert consent"
  ON customer_consent FOR INSERT
  WITH CHECK (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agency members can update consent"
  ON customer_consent FOR UPDATE
  USING (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() LIMIT 1
  ));

-- renewal_upload_batches
ALTER TABLE renewal_upload_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Agent can read upload batches"
  ON renewal_upload_batches FOR SELECT
  USING (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() LIMIT 1
  ));

CREATE POLICY "Agent can insert upload batches"
  ON renewal_upload_batches FOR INSERT
  WITH CHECK (agency_id = (
    SELECT agency_id FROM employees
    WHERE user_id = auth.uid() AND role IN ('agent') LIMIT 1
  ));
