-- Migration: 024_restore_fk_covering_indexes.sql
-- Purpose: Re-add covering indexes for foreign key columns that lost theirs
--          when migration 023 dropped unused indexes.
--
-- Without these indexes, JOIN and CASCADE operations on these FK columns
-- degrade to sequential scans. These are intentionally minimal single-column
-- indexes — just enough to cover the FK constraint.

-- stories: author_id → profiles(id)
CREATE INDEX IF NOT EXISTS idx_stories_author_id
  ON public.stories (author_id);

-- stories: archived_by → profiles(id)
CREATE INDEX IF NOT EXISTS idx_stories_archived_by
  ON public.stories (archived_by)
  WHERE archived_by IS NOT NULL;

-- stories: agency_id → agencies(id)
CREATE INDEX IF NOT EXISTS idx_stories_agency_id
  ON public.stories (agency_id)
  WHERE agency_id IS NOT NULL;

-- story_analytics: story_id → stories(id)
CREATE INDEX IF NOT EXISTS idx_story_analytics_story_id
  ON public.story_analytics (story_id);

-- story_drafts: author_id → profiles(id)
CREATE INDEX IF NOT EXISTS idx_story_drafts_author_id
  ON public.story_drafts (author_id);

-- story_drafts: story_id → stories(id)
CREATE INDEX IF NOT EXISTS idx_story_drafts_story_id
  ON public.story_drafts (story_id)
  WHERE story_id IS NOT NULL;

-- lead_quotes: agency_id → agencies(id)
-- (lead_id still covered by unique index idx_lead_quotes_lead_unique)
CREATE INDEX IF NOT EXISTS idx_lead_quotes_agency_id
  ON public.lead_quotes (agency_id);

-- audit_log: agency_id → agencies(id)
CREATE INDEX IF NOT EXISTS idx_audit_log_agency_id
  ON public.audit_log (agency_id)
  WHERE agency_id IS NOT NULL;

-- audit_log: actor_user_id → auth.users(id)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

-- enrichment_jobs: lead_id → leads(id)
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_lead_id
  ON public.enrichment_jobs (lead_id);

-- impersonation_sessions: admin_user_id → auth.users(id)
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_admin
  ON public.impersonation_sessions (admin_user_id);
