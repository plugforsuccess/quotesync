-- ============================================================================
-- UNIFIED EMAIL CAPTURE & CRM SYSTEM - DATABASE SCHEMA
-- ============================================================================
-- Database: PostgreSQL 14+
-- Encoding: UTF-8
-- Purpose: Single source of truth for all contact data across multiple entry points
-- ============================================================================

-- Drop existing tables (for clean setup)
DROP TABLE IF EXISTS event_actions CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS consents CASCADE;
DROP TABLE IF EXISTS sources CASCADE;
DROP TABLE IF EXISTS tracking_links CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;

-- ============================================================================
-- TABLE: contacts
-- Purpose: Central contact record with email as primary identifier
-- ============================================================================
CREATE TABLE contacts (
    -- Primary Key
    email VARCHAR(255) PRIMARY KEY,  -- Normalized: lowercase, trimmed

    -- Contact Information
    phone VARCHAR(20),               -- E.164 format: +1-555-123-4567
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    zip_code VARCHAR(10),

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Soft Delete
    deleted_at TIMESTAMP NULL,

    -- Indexes
    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Indexes for performance
CREATE INDEX idx_contacts_created_at ON contacts(created_at);
CREATE INDEX idx_contacts_last_seen ON contacts(last_seen);
CREATE INDEX idx_contacts_zip_code ON contacts(zip_code);
CREATE INDEX idx_contacts_deleted_at ON contacts(deleted_at) WHERE deleted_at IS NOT NULL;

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: sources
-- Purpose: Track all entry points for each contact (many-to-many)
-- ============================================================================
CREATE TABLE sources (
    source_id SERIAL PRIMARY KEY,

    -- Foreign Key
    contact_email VARCHAR(255) NOT NULL REFERENCES contacts(email) ON DELETE CASCADE,

    -- Source Information
    source VARCHAR(50) NOT NULL,  -- post_quote, policy_share, stripe_purchase, drivers_ed, etc.
    captured_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Context Metadata (JSON)
    metadata JSONB DEFAULT '{}',

    -- UTM Parameters
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    utm_term VARCHAR(100),
    utm_content VARCHAR(100),

    -- Technical Metadata
    ip_address INET,
    user_agent TEXT,
    referrer TEXT,

    -- Constraints
    CONSTRAINT valid_source CHECK (source IN (
        'post_quote',
        'policy_share',
        'stripe_purchase',
        'drivers_ed',
        'store_waitlist',
        'general_inquiry',
        'education',
        'import'
    ))
);

-- Indexes
CREATE INDEX idx_sources_contact ON sources(contact_email);
CREATE INDEX idx_sources_source ON sources(source);
CREATE INDEX idx_sources_captured_at ON sources(captured_at);
CREATE INDEX idx_sources_metadata ON sources USING GIN(metadata);

-- Prevent duplicate source entries
CREATE UNIQUE INDEX idx_sources_unique
    ON sources(contact_email, source, captured_at);

-- ============================================================================
-- TABLE: consents
-- Purpose: Track consent history for GDPR/CCPA compliance
-- ============================================================================
CREATE TABLE consents (
    consent_id SERIAL PRIMARY KEY,

    -- Foreign Key
    contact_email VARCHAR(255) NOT NULL REFERENCES contacts(email) ON DELETE CASCADE,

    -- Consent Type
    consent_type VARCHAR(50) NOT NULL,

    -- Consent Status
    granted BOOLEAN NOT NULL,

    -- Audit Trail
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    source VARCHAR(50) NOT NULL,  -- Where consent was collected
    ip_address INET,
    user_agent TEXT,

    -- Additional Context
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT valid_consent_type CHECK (consent_type IN (
        'marketing_email',
        'transactional_email',
        'sms_updates',
        'data_storage',
        'third_party_share'
    ))
);

-- Indexes
CREATE INDEX idx_consents_contact ON consents(contact_email);
CREATE INDEX idx_consents_type ON consents(consent_type);
CREATE INDEX idx_consents_granted_at ON consents(granted_at);

-- Get latest consent status per type (view)
CREATE OR REPLACE VIEW latest_consents AS
SELECT DISTINCT ON (contact_email, consent_type)
    contact_email,
    consent_type,
    granted,
    granted_at,
    source
FROM consents
ORDER BY contact_email, consent_type, granted_at DESC;

-- ============================================================================
-- TABLE: events
-- Purpose: Event log for all contact interactions and triggers
-- ============================================================================
CREATE TABLE events (
    event_id BIGSERIAL PRIMARY KEY,

    -- Foreign Key
    contact_email VARCHAR(255) NOT NULL REFERENCES contacts(email) ON DELETE CASCADE,

    -- Event Information
    event_type VARCHAR(100) NOT NULL,
    source VARCHAR(50),

    -- Event Data
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Indexes
    CONSTRAINT valid_event_type CHECK (event_type IN (
        'email_captured',
        'phone_captured',
        'policy_shared',
        'purchase_completed',
        'drivers_ed_clicked',
        'waitlist_joined',
        'email_opened',
        'email_clicked',
        'link_clicked',
        'contact_merged',
        'consent_updated',
        'download_accessed',
        'course_completed'
    ))
);

-- Indexes (optimized for time-series queries)
CREATE INDEX idx_events_contact ON events(contact_email);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at DESC);
CREATE INDEX idx_events_contact_created ON events(contact_email, created_at DESC);
CREATE INDEX idx_events_metadata ON events USING GIN(metadata);

-- Partition by month (for scalability)
-- CREATE TABLE events_2026_01 PARTITION OF events
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
-- (Create partitions as needed)

-- ============================================================================
-- TABLE: event_actions
-- Purpose: Track actions triggered by events
-- ============================================================================
CREATE TABLE event_actions (
    action_id BIGSERIAL PRIMARY KEY,

    -- Foreign Key
    event_id BIGINT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,

    -- Action Details
    action_type VARCHAR(50) NOT NULL,  -- send_email, add_to_sequence, create_task, etc.
    action_data JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Error Handling
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,

    -- Constraints
    CONSTRAINT valid_action_type CHECK (action_type IN (
        'send_email',
        'send_sms',
        'add_to_sequence',
        'create_crm_task',
        'add_tag',
        'update_crm',
        'grant_access',
        'create_tracking_link',
        'schedule_followup',
        'notify_agent'
    )),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Indexes
CREATE INDEX idx_event_actions_event ON event_actions(event_id);
CREATE INDEX idx_event_actions_status ON event_actions(status) WHERE status != 'completed';
CREATE INDEX idx_event_actions_created ON event_actions(created_at);

-- ============================================================================
-- TABLE: orders
-- Purpose: Store purchase records from Stripe
-- ============================================================================
CREATE TABLE orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Key
    contact_email VARCHAR(255) NOT NULL REFERENCES contacts(email) ON DELETE RESTRICT,

    -- Stripe References
    stripe_session_id VARCHAR(255) UNIQUE,
    stripe_payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),

    -- Order Details
    product_id VARCHAR(100) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    amount_cents INT NOT NULL,  -- Store in cents to avoid floating point issues
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending, completed, refunded, failed

    -- Fulfillment
    download_link TEXT,
    access_granted BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Constraints
    CONSTRAINT valid_order_status CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
    CONSTRAINT positive_amount CHECK (amount_cents > 0)
);

-- Indexes
CREATE INDEX idx_orders_contact ON orders(contact_email);
CREATE INDEX idx_orders_stripe_session ON orders(stripe_session_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- ============================================================================
-- TABLE: tracking_links
-- Purpose: Generate and track unique links for drivers ed and external partners
-- ============================================================================
CREATE TABLE tracking_links (
    tracking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Key
    contact_email VARCHAR(255) NOT NULL REFERENCES contacts(email) ON DELETE CASCADE,

    -- Tracking Code (short, URL-safe)
    tracking_code VARCHAR(20) UNIQUE NOT NULL,

    -- Destination
    destination_url TEXT NOT NULL,
    partner VARCHAR(50),  -- national_drivers_ed, etc.

    -- Metadata
    source VARCHAR(50),  -- drivers_ed, email_link, etc.
    metadata JSONB DEFAULT '{}',

    -- Tracking Stats
    click_count INT DEFAULT 0,
    first_clicked_at TIMESTAMP,
    last_clicked_at TIMESTAMP,

    -- Status
    active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,

    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_tracking_links_contact ON tracking_links(contact_email);
CREATE INDEX idx_tracking_links_code ON tracking_links(tracking_code);
CREATE INDEX idx_tracking_links_partner ON tracking_links(partner);
CREATE INDEX idx_tracking_links_active ON tracking_links(active) WHERE active = TRUE;

-- Function to generate short tracking codes
CREATE OR REPLACE FUNCTION generate_tracking_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    chars TEXT := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result VARCHAR(20) := '';
    i INT;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS: Aggregate data for reporting
-- ============================================================================

-- View: Contact Summary (with source count and latest activity)
CREATE OR REPLACE VIEW contact_summary AS
SELECT
    c.email,
    c.first_name,
    c.last_name,
    c.phone,
    c.zip_code,
    c.created_at,
    c.last_seen,
    COUNT(DISTINCT s.source) as source_count,
    ARRAY_AGG(DISTINCT s.source) as sources,
    COUNT(DISTINCT e.event_id) as event_count,
    MAX(e.created_at) as last_event_at,
    COUNT(DISTINCT o.order_id) as order_count,
    SUM(o.amount_cents) as lifetime_value_cents
FROM contacts c
LEFT JOIN sources s ON c.email = s.contact_email
LEFT JOIN events e ON c.email = e.contact_email
LEFT JOIN orders o ON c.email = o.contact_email AND o.status = 'completed'
WHERE c.deleted_at IS NULL
GROUP BY c.email;

-- View: Source Performance
CREATE OR REPLACE VIEW source_performance AS
SELECT
    source,
    COUNT(DISTINCT contact_email) as unique_contacts,
    COUNT(*) as total_captures,
    MIN(captured_at) as first_capture,
    MAX(captured_at) as last_capture,
    DATE_TRUNC('day', captured_at) as capture_date
FROM sources
GROUP BY source, DATE_TRUNC('day', captured_at)
ORDER BY capture_date DESC, unique_contacts DESC;

-- View: Consent Status by Type
CREATE OR REPLACE VIEW consent_summary AS
SELECT
    consent_type,
    COUNT(*) FILTER (WHERE granted = TRUE) as granted_count,
    COUNT(*) FILTER (WHERE granted = FALSE) as denied_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE granted = TRUE) / NULLIF(COUNT(*), 0),
        2
    ) as opt_in_rate
FROM latest_consents
GROUP BY consent_type;

-- ============================================================================
-- FUNCTIONS: Contact Orchestration
-- ============================================================================

-- Function: Upsert Contact (merge or create)
CREATE OR REPLACE FUNCTION upsert_contact(
    p_email VARCHAR(255),
    p_phone VARCHAR(20) DEFAULT NULL,
    p_first_name VARCHAR(100) DEFAULT NULL,
    p_last_name VARCHAR(100) DEFAULT NULL,
    p_zip_code VARCHAR(10) DEFAULT NULL,
    p_source VARCHAR(50) DEFAULT 'general_inquiry',
    p_metadata JSONB DEFAULT '{}',
    p_utm_source VARCHAR(100) DEFAULT NULL,
    p_utm_medium VARCHAR(100) DEFAULT NULL,
    p_utm_campaign VARCHAR(100) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE(
    email VARCHAR(255),
    is_new BOOLEAN,
    source_added BOOLEAN
) AS $$
DECLARE
    v_normalized_email VARCHAR(255);
    v_is_new BOOLEAN := FALSE;
    v_source_added BOOLEAN := FALSE;
    v_existing_record RECORD;
BEGIN
    -- Normalize email
    v_normalized_email := LOWER(TRIM(p_email));

    -- Check if contact exists
    SELECT * INTO v_existing_record FROM contacts WHERE contacts.email = v_normalized_email;

    IF v_existing_record IS NULL THEN
        -- Create new contact
        INSERT INTO contacts (email, phone, first_name, last_name, zip_code)
        VALUES (v_normalized_email, p_phone, p_first_name, p_last_name, p_zip_code);

        v_is_new := TRUE;

        -- Log event
        INSERT INTO events (contact_email, event_type, source, metadata)
        VALUES (v_normalized_email, 'email_captured', p_source, p_metadata);
    ELSE
        -- Update existing contact (prefer non-null values)
        UPDATE contacts SET
            phone = COALESCE(p_phone, phone),
            first_name = COALESCE(p_first_name, first_name),
            last_name = COALESCE(p_last_name, last_name),
            zip_code = COALESCE(p_zip_code, zip_code),
            last_seen = NOW()
        WHERE contacts.email = v_normalized_email;

        -- Log merge event
        INSERT INTO events (contact_email, event_type, source, metadata)
        VALUES (v_normalized_email, 'contact_merged', p_source, p_metadata);
    END IF;

    -- Add source (if not duplicate)
    BEGIN
        INSERT INTO sources (
            contact_email, source, metadata,
            utm_source, utm_medium, utm_campaign,
            ip_address, user_agent
        )
        VALUES (
            v_normalized_email, p_source, p_metadata,
            p_utm_source, p_utm_medium, p_utm_campaign,
            p_ip_address, p_user_agent
        );

        v_source_added := TRUE;
    EXCEPTION WHEN unique_violation THEN
        -- Source already exists for this contact, ignore
        v_source_added := FALSE;
    END;

    -- Return result
    RETURN QUERY SELECT v_normalized_email, v_is_new, v_source_added;
END;
$$ LANGUAGE plpgsql;

-- Function: Add Consent
CREATE OR REPLACE FUNCTION add_consent(
    p_email VARCHAR(255),
    p_consent_type VARCHAR(50),
    p_granted BOOLEAN,
    p_source VARCHAR(50),
    p_ip_address INET DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
DECLARE
    v_normalized_email VARCHAR(255);
BEGIN
    v_normalized_email := LOWER(TRIM(p_email));

    -- Insert consent record
    INSERT INTO consents (
        contact_email, consent_type, granted, source, ip_address, metadata
    )
    VALUES (
        v_normalized_email, p_consent_type, p_granted, p_source, p_ip_address, p_metadata
    );

    -- Log event
    INSERT INTO events (contact_email, event_type, source, metadata)
    VALUES (
        v_normalized_email,
        'consent_updated',
        p_source,
        jsonb_build_object(
            'consent_type', p_consent_type,
            'granted', p_granted
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function: Create Tracking Link
CREATE OR REPLACE FUNCTION create_tracking_link(
    p_email VARCHAR(255),
    p_destination_url TEXT,
    p_partner VARCHAR(50),
    p_source VARCHAR(50),
    p_metadata JSONB DEFAULT '{}',
    p_expires_in_days INT DEFAULT 90
)
RETURNS TABLE(
    tracking_id UUID,
    tracking_code VARCHAR(20),
    tracking_url TEXT
) AS $$
DECLARE
    v_normalized_email VARCHAR(255);
    v_tracking_id UUID;
    v_tracking_code VARCHAR(20);
    v_base_url TEXT := 'https://insuredbycam.com/track/';
BEGIN
    v_normalized_email := LOWER(TRIM(p_email));

    -- Generate unique tracking code
    LOOP
        v_tracking_code := generate_tracking_code();
        EXIT WHEN NOT EXISTS (SELECT 1 FROM tracking_links WHERE tracking_code = v_tracking_code);
    END LOOP;

    -- Insert tracking link
    INSERT INTO tracking_links (
        contact_email, tracking_code, destination_url, partner, source, metadata, expires_at
    )
    VALUES (
        v_normalized_email,
        v_tracking_code,
        p_destination_url,
        p_partner,
        p_source,
        p_metadata,
        NOW() + (p_expires_in_days || ' days')::INTERVAL
    )
    RETURNING tracking_links.tracking_id INTO v_tracking_id;

    -- Return tracking link details
    RETURN QUERY SELECT
        v_tracking_id,
        v_tracking_code,
        v_base_url || v_tracking_code;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (for testing)
-- ============================================================================

-- Example: Insert test contact
-- SELECT * FROM upsert_contact(
--     p_email := 'test@example.com',
--     p_first_name := 'Test',
--     p_last_name := 'User',
--     p_source := 'post_quote',
--     p_metadata := '{"context": "insurance_quote"}'::jsonb
-- );

-- Example: Add marketing consent
-- SELECT add_consent(
--     p_email := 'test@example.com',
--     p_consent_type := 'marketing_email',
--     p_granted := TRUE,
--     p_source := 'post_quote'
-- );

-- ============================================================================
-- MAINTENANCE QUERIES
-- ============================================================================

-- Archive old events (keep last 2 years)
-- DELETE FROM events WHERE created_at < NOW() - INTERVAL '2 years';

-- Find duplicate contacts (should be impossible with email as PK)
-- SELECT email, COUNT(*) FROM contacts GROUP BY email HAVING COUNT(*) > 1;

-- Contacts with multiple sources
-- SELECT contact_email, COUNT(*) as source_count
-- FROM sources
-- GROUP BY contact_email
-- HAVING COUNT(*) > 1
-- ORDER BY source_count DESC;

-- Consent opt-in rates
-- SELECT * FROM consent_summary;

-- Top performing sources
-- SELECT source, COUNT(*) as capture_count
-- FROM sources
-- WHERE captured_at > NOW() - INTERVAL '30 days'
-- GROUP BY source
-- ORDER BY capture_count DESC;

-- ============================================================================
-- BACKUP & RESTORE
-- ============================================================================

-- Backup command:
-- pg_dump -U postgres -d quotesync_crm -F c -b -v -f backup_$(date +%Y%m%d).dump

-- Restore command:
-- pg_restore -U postgres -d quotesync_crm -v backup_20260107.dump

-- ============================================================================
-- END OF SCHEMA
-- ============================================================================
