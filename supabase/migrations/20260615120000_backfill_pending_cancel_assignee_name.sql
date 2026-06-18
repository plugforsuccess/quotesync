-- ============================================================================
-- Backfill pending_cases.assigned_to (display name) from assigned_to_id
-- ============================================================================
-- pending_cases.assigned_to is a TEXT display name (the cancel importer writes
-- it). A handful of cases ended up with an assignee id but a null/empty name —
-- e.g. assigned via a path that set only the id — so the cancel detail rendered
-- them as "Unassigned" despite being correctly routed to a rep's queue.
--
-- This fills the name from the linked employee. Safe + idempotent: only touches
-- rows that have an assignee id but a blank name.
--
-- NOTE: renewal_cases.assigned_to is a DIFFERENT (uuid, legacy) column and is
-- intentionally NOT touched here — renewals route and display via
-- assigned_to_id and need no name backfill.
-- ============================================================================

UPDATE public.pending_cases pc
SET assigned_to = COALESCE(
      NULLIF(e.preferred_name, ''),
      NULLIF(btrim(concat_ws(' ', e.first_name, e.last_name)), '')
    )
FROM public.employees e
WHERE pc.assigned_to_id = e.id
  AND pc.assigned_to_id IS NOT NULL
  AND (pc.assigned_to IS NULL OR pc.assigned_to = '');
