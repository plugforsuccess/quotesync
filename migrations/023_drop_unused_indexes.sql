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
-- Duplicate indexes from Section 3 were already dropped in migration 020.

-- =============================================================================
-- stories (15 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_stories_status;
DROP INDEX IF EXISTS idx_stories_published_at;
DROP INDEX IF EXISTS idx_stories_category;
DROP INDEX IF EXISTS idx_stories_region;
DROP INDEX IF EXISTS idx_stories_slug;
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
-- leads (14 indexes — excludes idx_leads_agency dropped in 020)
-- =============================================================================
DROP INDEX IF EXISTS idx_leads_agency_id;
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
DROP INDEX IF EXISTS idx_leads_phone;

-- =============================================================================
-- lead_quotes (3 indexes — excludes unique idx_lead_quotes_lead_unique)
-- =============================================================================
DROP INDEX IF EXISTS idx_lead_quotes_lead_id;
DROP INDEX IF EXISTS idx_lead_quotes_agency_id;
DROP INDEX IF EXISTS idx_lead_quotes_enrichment_status;

-- =============================================================================
-- lead_messages (1 index)
-- =============================================================================
DROP INDEX IF EXISTS idx_lead_messages_lead;

-- =============================================================================
-- audit_log (5 indexes — excludes duplicates dropped in 020)
-- =============================================================================
DROP INDEX IF EXISTS idx_audit_log_agency_id;
DROP INDEX IF EXISTS idx_audit_log_lead_id;
DROP INDEX IF EXISTS idx_audit_log_event_type;
DROP INDEX IF EXISTS idx_audit_log_created_at;
DROP INDEX IF EXISTS idx_audit_log_actor;

-- =============================================================================
-- routing_rules (4 indexes — excludes duplicate dropped in 020)
-- =============================================================================
DROP INDEX IF EXISTS idx_routing_rules_agency_id;
DROP INDEX IF EXISTS idx_routing_rules_state_zip;
DROP INDEX IF EXISTS idx_routing_rules_priority;
DROP INDEX IF EXISTS idx_routing_rules_state;

-- =============================================================================
-- agencies (2 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_agencies_status;
DROP INDEX IF EXISTS idx_agencies_default;

-- =============================================================================
-- agency_users (2 indexes — excludes duplicates dropped in 020)
-- =============================================================================
DROP INDEX IF EXISTS idx_agency_users_user_id;
DROP INDEX IF EXISTS idx_agency_users_agency_id;

-- =============================================================================
-- profiles (4 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_profiles_email;
DROP INDEX IF EXISTS idx_profiles_role;
DROP INDEX IF EXISTS idx_profiles_platform_role;
DROP INDEX IF EXISTS idx_profiles_is_platform_user;

-- =============================================================================
-- notifications (2 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_notifications_user;
DROP INDEX IF EXISTS idx_notifications_unread;

-- =============================================================================
-- agency_memberships (4 indexes)
-- =============================================================================
DROP INDEX IF EXISTS idx_agency_memberships_user_id;
DROP INDEX IF EXISTS idx_agency_memberships_agency_id;
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
