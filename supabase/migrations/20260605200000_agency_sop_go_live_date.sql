-- ============================================================================
-- Agency SOP go-live date
-- ============================================================================
-- Marks the date the agency adopted standardized SOPs. Analytics measure the
-- clean "SOP era" from this date forward; everything before is preserved as the
-- baseline (the before/after proof that the SOPs worked). NOT a data reset —
-- nothing is deleted; this is just the line we measure from.
-- ============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS sop_go_live_date DATE;

-- Default the existing agency to 2026-07-01 (set per-agency as others onboard).
UPDATE public.agencies
SET sop_go_live_date = '2026-07-01'
WHERE sop_go_live_date IS NULL;

COMMENT ON COLUMN public.agencies.sop_go_live_date IS
  'Date the agency went live on standardized SOPs. Retention analytics measure the clean SOP era from here; data before is the baseline (never deleted).';
