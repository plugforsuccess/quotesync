-- Migration: 021_add_foreign_key_indexes.sql
-- Purpose: Add indexes on unindexed foreign keys flagged by Supabase database linter
-- Risk: Zero — these only improve JOIN and CASCADE performance

CREATE INDEX IF NOT EXISTS idx_agency_memberships_invited_by
  ON public.agency_memberships (invited_by);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_target_agency
  ON public.impersonation_sessions (target_agency_id);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_target_user
  ON public.impersonation_sessions (target_user_id);
