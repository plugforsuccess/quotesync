-- Migration: 023_drop_unused_indexes.sql
-- Purpose: Drop indexes flagged as unused (idx_scan = 0) by Supabase database linter
--
-- !! IMPORTANT: Review before running in production !!
-- These indexes show zero scans in pg_stat_user_indexes but some may be needed for:
--   - Queries that haven't run yet (new features)
--   - RLS policy evaluation (may not appear in user index stats)
--   - Foreign key enforcement (JOIN/CASCADE performance)
--
-- Verify with: SELECT indexrelname, idx_scan FROM pg_stat_user_indexes
--              WHERE schemaname = 'public' ORDER BY idx_scan, indexrelname;
--
-- Excluded from this migration:
--   - Duplicate indexes already dropped in migration 020
--   - Indexes that 020 explicitly kept (the non-duplicate counterparts)
--   - idx_stories_slug (needed for URL lookups e.g. /stories/:slug)
--   - idx_profiles_email (needed for auth flows, invitations, deduplication)
--   - idx_leads_phone (needed for Twilio inbound SMS matching)
--   - idx_notifications_user (used by notification RLS: user_id = auth.uid())
--   - idx_lead_messages_lead (used by lead_messages RLS JOIN on lead_id)
--   - idx_agency_memberships_user_id (used by has_agency_role() / get_user_agency_ids())
--   - idx_agency_memberships_agency_id (used by agency membership RLS lookups)

BEGIN;

-- =============================================================================
-- stories (12 indexes — kept idx_stories_slug for URL lookups)
-- =============================================================================
DROP INDEX IF EXISTS idx_stories_status;
DROP INDEX IF EXISTS idx_stories_published_at;
DROP INDEX IF EXISTS idx_stories_category;
DROP INDEX IF EXISTS idx_stories_region;
-- KEPT: idx_stories_slug (URL lookups for /stories/:slug)
DROP INDEX IF EXISTS idx_stories_featured;
DROP INDEX IF EXISTS idx_stories_archived;
DROP INDEX IF EXISTS idx_stories_archived_by;
DROP INDEX IF EXISTS idx_stories_author_id;
DROP INDEX IF EXISTS idx_stories_updated_at;
DROP INDEX IF EXISTS idx_stories_published;
DROP INDEX IF EXISTS idx_stories_category_published;
DROP INDEX IF EXISTS idx_stories_status_updated;
DROP INDEX IF EXISTS idx_stories_agency_id;
DROP INDEX IF EXISTS idx_stories_secondary_tags;

-- =============================================================================
-- story_analytics (4 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_story_analytics_story_id;
DROP INDEX IF EXISTS idx_story_analytics_event_type;
DROP INDEX IF EXISTS idx_story_analytics_created_at;
DROP INDEX IF EXISTS idx_story_analytics_session;

-- =============================================================================
-- story_drafts (6 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_story_drafts_author_id;
DROP INDEX IF EXISTS idx_story_drafts_updated_at;
DROP INDEX IF EXISTS idx_story_drafts_status;
DROP INDEX IF EXISTS idx_story_drafts_author_status_updated;
DROP INDEX IF EXISTS idx_story_drafts_story_id;
DROP INDEX IF EXISTS idx_story_drafts_secondary_tags;

-- =============================================================================
-- leads (10 indexes)
-- KEPT: idx_leads_agency_id (migration 020 keeps this as the non-duplicate)
-- KEPT: idx_leads_phone (Twilio inbound SMS matching)
-- =============================================================================
DROP INDEX IF EXISTS idx_leads_status;
DROP INDEX IF EXISTS idx_leads_agency_status;
DROP INDEX IF EXISTS idx_leads_updated_at;
DROP INDEX IF EXISTS idx_leads_created;
DROP INDEX IF EXISTS idx_leads_pull_id;
DROP INDEX IF EXISTS idx_leads_enrichment_status;
DROP INDEX IF EXISTS idx_leads_score;
DROP INDEX IF EXISTS idx_leads_first_contact;
DROP INDEX IF EXISTS idx_leads_agency_score;
DROP INDEX IF EXISTS idx_leads_agency_created;
DROP INDEX IF EXISTS idx_leads_dashboard_sort;
DROP INDEX IF EXISTS idx_leads_drip;

-- =============================================================================
-- lead_quotes (3 indexes — excludes unique idx_lead_quotes_lead_unique)
-- =============================================================================
DROP INDEX IF EXISTS idx_lead_quotes_lead_id;
DROP INDEX IF EXISTS idx_lead_quotes_agency_id;
DROP INDEX IF EXISTS idx_lead_quotes_enrichment_status;

-- =============================================================================
-- lead_messages (0 indexes)
-- KEPT: idx_lead_messages_lead (used by RLS JOIN: lead_id IN SELECT from leads)
-- =============================================================================

-- =============================================================================
-- audit_log (2 indexes)
-- KEPT: idx_audit_log_lead_id (migration 020 keeps this as the non-duplicate)
-- KEPT: idx_audit_log_event_type (migration 020 keeps this as the non-duplicate)
-- KEPT: idx_audit_log_created_at (migration 020 keeps this as the non-duplicate)
-- =============================================================================
DROP INDEX IF EXISTS idx_audit_log_agency_id;
DROP INDEX IF EXISTS idx_audit_log_actor;

-- =============================================================================
-- routing_rules (3 indexes)
-- KEPT: idx_routing_rules_agency_id (migration 020 keeps this as the non-duplicate)
-- =============================================================================
DROP INDEX IF EXISTS idx_routing_rules_state_zip;
DROP INDEX IF EXISTS idx_routing_rules_priority;
DROP INDEX IF EXISTS idx_routing_rules_state;

-- =============================================================================
-- agencies (2 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_agencies_status;
DROP INDEX IF EXISTS idx_agencies_default;

-- =============================================================================
-- agency_users (0 indexes)
-- KEPT: idx_agency_users_user_id (migration 020 keeps this as the non-duplicate)
-- KEPT: idx_agency_users_agency_id (migration 020 keeps this as the non-duplicate)
-- =============================================================================

-- =============================================================================
-- profiles (2 indexes)
-- KEPT: idx_profiles_email (auth flows, invitations, deduplication)
-- KEPT: idx_profiles_role (used in RLS policy EXISTS checks across many tables)
-- =============================================================================
DROP INDEX IF EXISTS idx_profiles_platform_role;
DROP INDEX IF EXISTS idx_profiles_is_platform_user;

-- =============================================================================
-- notifications (1 index)
-- KEPT: idx_notifications_user (used by RLS: user_id = auth.uid())
-- =============================================================================
DROP INDEX IF EXISTS idx_notifications_unread;

-- =============================================================================
-- agency_memberships (2 indexes)
-- KEPT: idx_agency_memberships_user_id (used by has_agency_role() / get_user_agency_ids())
-- KEPT: idx_agency_memberships_agency_id (used by agency membership RLS lookups)
-- =============================================================================
DROP INDEX IF EXISTS idx_agency_memberships_status;
DROP INDEX IF EXISTS idx_agency_memberships_role;

-- =============================================================================
-- impersonation_sessions (3 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_impersonation_sessions_admin;
DROP INDEX IF EXISTS idx_impersonation_sessions_active;
DROP INDEX IF EXISTS idx_impersonation_sessions_started;

-- =============================================================================
-- enrichment_jobs (3 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_enrichment_jobs_status;
DROP INDEX IF EXISTS idx_enrichment_jobs_lead;
DROP INDEX IF EXISTS idx_enrichment_jobs_pull;

-- =============================================================================
-- story_category_definitions / story_tag_definitions (2 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_story_category_definitions_active;
DROP INDEX IF EXISTS idx_story_tag_definitions_active;

COMMIT;
