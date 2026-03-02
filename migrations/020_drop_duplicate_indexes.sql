-- Migration: 020_drop_duplicate_indexes.sql
-- Purpose: Drop duplicate indexes flagged by Supabase database linter
-- Risk: Zero — each dropped index has an identical counterpart that is kept
--
-- Duplicates identified (dropping left, keeping right):
--   idx_agency_users_agency  → idx_agency_users_agency_id
--   idx_agency_users_user    → idx_agency_users_user_id
--   idx_audit_log_created    → idx_audit_log_created_at
--   idx_audit_log_event      → idx_audit_log_event_type
--   idx_audit_log_lead       → idx_audit_log_lead_id
--   idx_leads_agency         → idx_leads_agency_id
--   idx_routing_rules_agency → idx_routing_rules_agency_id

-- agency_users duplicates
DROP INDEX IF EXISTS idx_agency_users_agency;
DROP INDEX IF EXISTS idx_agency_users_user;

-- audit_log duplicates
DROP INDEX IF EXISTS idx_audit_log_created;
DROP INDEX IF EXISTS idx_audit_log_event;
DROP INDEX IF EXISTS idx_audit_log_lead;

-- leads duplicate
DROP INDEX IF EXISTS idx_leads_agency;

-- routing_rules duplicate
DROP INDEX IF EXISTS idx_routing_rules_agency;
