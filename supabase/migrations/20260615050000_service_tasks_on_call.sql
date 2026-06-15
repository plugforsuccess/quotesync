-- ============================================================================
-- service_tasks — resolve-on-call support
-- ============================================================================
-- Service requests that surface during a renewal/cancel call should be handled
-- on that same call, not deferred to a batch — one-touch resolution beats a
-- callback and stops the customer from becoming a separate reactive inbound.
--
-- This adds the link back to the originating case and a flag marking a task as
-- resolved live on the call. Resolved-on-call tasks are created already 'done';
-- the existing stamp trigger handles completion timestamps. Cold inbound tasks
-- (the batch) are unchanged — they're still created 'open'.
-- ============================================================================

ALTER TABLE public.service_tasks
  ADD COLUMN IF NOT EXISTS source_case_type text
    CHECK (source_case_type IS NULL OR source_case_type IN ('renewal','cancel')),
  ADD COLUMN IF NOT EXISTS source_case_id   uuid,
  ADD COLUMN IF NOT EXISTS resolved_on_call boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_service_tasks_source
  ON public.service_tasks (source_case_type, source_case_id);

-- Analytics helper: typed tally of what was absorbed on renewal/cancel calls
-- vs. what came in cold, per agency. This is the measurement behind
-- "working renewals reduces reactive inbound calls."
CREATE INDEX IF NOT EXISTS idx_service_tasks_oncall
  ON public.service_tasks (agency_id, resolved_on_call, task_type);
