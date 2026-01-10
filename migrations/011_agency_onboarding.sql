-- Migration: 011_agency_onboarding.sql
-- Purpose: Add agency application fields and rejected status for onboarding workflow

-- =============================================================================
-- ADD REJECTED STATUS TO ENUM
-- =============================================================================

ALTER TYPE agency_status ADD VALUE IF NOT EXISTS 'rejected';

-- =============================================================================
-- ADD APPLICATION FIELDS TO AGENCIES TABLE
-- =============================================================================

ALTER TABLE agencies
    ADD COLUMN IF NOT EXISTS primary_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS state_licenses TEXT[],
    ADD COLUMN IF NOT EXISTS lines_of_business TEXT[],
    ADD COLUMN IF NOT EXISTS application_data JSONB DEFAULT '{}';

COMMENT ON COLUMN agencies.primary_contact_name IS 'Primary contact name for the agency';
COMMENT ON COLUMN agencies.phone IS 'Primary contact phone number';
COMMENT ON COLUMN agencies.state_licenses IS 'Array of state abbreviations where agency is licensed';
COMMENT ON COLUMN agencies.lines_of_business IS 'Array of LOBs: auto, home, life, etc.';
COMMENT ON COLUMN agencies.application_data IS 'Additional application data: license_identifiers, desired_territories, notes';

-- =============================================================================
-- RLS POLICIES FOR ADMIN ACCESS
-- =============================================================================

-- Allow admins to view all agencies (for admin panel)
CREATE POLICY "Admins can view all agencies"
    ON agencies FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to update any agency
CREATE POLICY "Admins can update any agency"
    ON agencies FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow public to insert pending agencies (application submission)
CREATE POLICY "Public can submit agency applications"
    ON agencies FOR INSERT TO anon
    WITH CHECK (status = 'pending');

-- Allow authenticated users to submit applications too
CREATE POLICY "Authenticated can submit agency applications"
    ON agencies FOR INSERT TO authenticated
    WITH CHECK (status = 'pending');

-- =============================================================================
-- ADMIN POLICIES FOR ROUTING_RULES
-- =============================================================================

-- Allow admins to view all routing_rules
CREATE POLICY "Admins can view all routing_rules"
    ON routing_rules FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to create routing_rules for any agency
CREATE POLICY "Admins can create routing_rules"
    ON routing_rules FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to update any routing_rules
CREATE POLICY "Admins can update routing_rules"
    ON routing_rules FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to delete routing_rules
CREATE POLICY "Admins can delete routing_rules"
    ON routing_rules FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =============================================================================
-- ADMIN POLICIES FOR AGENCY_USERS
-- =============================================================================

-- Allow admins to view all agency_users
CREATE POLICY "Admins can view all agency_users"
    ON agency_users FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to create agency_users
CREATE POLICY "Admins can create agency_users"
    ON agency_users FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to update agency_users
CREATE POLICY "Admins can update agency_users"
    ON agency_users FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to delete agency_users
CREATE POLICY "Admins can delete agency_users"
    ON agency_users FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =============================================================================
-- ADMIN POLICIES FOR AUDIT_LOG
-- =============================================================================

-- Allow admins to view all audit_log entries
CREATE POLICY "Admins can view all audit_log"
    ON audit_log FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow admins to create audit_log entries
CREATE POLICY "Admins can create audit_log entries"
    ON audit_log FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- =============================================================================
-- CONSTRAINT: ROUTING RULES ONLY ACTIVE FOR APPROVED AGENCIES
-- =============================================================================

-- Create function to check agency status before allowing routing rule creation
CREATE OR REPLACE FUNCTION check_agency_approved_for_routing()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow admins to create rules, but they'll only be "active" for approved agencies
    -- This is a documentation constraint - actual routing logic should check agency status
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Comment explaining the constraint
COMMENT ON FUNCTION check_agency_approved_for_routing() IS
    'Routing rules can be created for any agency, but will only be active when agency status is approved';
