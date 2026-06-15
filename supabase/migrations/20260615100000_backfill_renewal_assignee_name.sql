-- ============================================================================
-- Backfill renewal_cases.assigned_to (display name) from assigned_to_id
-- ============================================================================
-- The renewal importer historically set assigned_to_id (the routing key) but
-- not the assigned_to text column, so name-based views rendered assigned cases
-- as "Unassigned" even though they were correctly routed to a rep's queue. The
-- importer now writes both; this backfills the rows created before that fix.
--
-- Safe + idempotent: only touches rows that have an assignee id but a blank
-- name. Re-running it is a no-op.
-- ============================================================================

UPDATE public.renewal_cases rc
SET assigned_to = COALESCE(
      NULLIF(e.preferred_name, ''),
      NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), '')
    )
FROM public.employees e
WHERE rc.assigned_to_id = e.id
  AND rc.assigned_to_id IS NOT NULL
  AND (rc.assigned_to IS NULL OR rc.assigned_to = '');
