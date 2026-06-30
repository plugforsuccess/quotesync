-- ============================================================================
-- Clear saved_premium on non-credited auto-resolved cases
-- ============================================================================
-- `saved_premium` means "premium credited as a save." `auto_resolved` is never
-- a credited save — it's a renewed-but-not-credited close: the nightly easy-pay/
-- age cron (system-inferred), an import "already paid" close, or a rep logging a
-- "happy with policy" / "already paid" call (renewed, observed, not a save).
-- Every save tally already gates on status IN ('confirmed') for renewals and
-- ('saved','rewritten') for cancels, so these rows were never summed as saves —
-- but they carried a populated saved_premium that LOOKED like a credited save
-- and was a latent double-count trap for any future query that summed the column
-- without also filtering status.
--
-- The work-surface write paths now leave saved_premium NULL on these closes
-- (RetentionCancels.jsx). This backfills the existing rows to match, restoring
-- the invariant: saved_premium is non-null  ⇔  the row is a credited save.
--
-- Safe / metric-neutral:
--   * Renewal premium audit derives the paid amount from the offer for
--     auto_resolved rows when saved_premium IS NULL (same value it had).
--   * Save velocity, retention metrics, and the "saved today" tally only read
--     saved_premium on confirmed/saved/rewritten rows — never auto_resolved.
--   * The elasticity views don't read saved_premium at all.
-- Pure data update (no DDL), so no PostgREST schema reload is required.
-- ============================================================================

UPDATE public.renewal_cases
SET saved_premium = NULL
WHERE status = 'auto_resolved'
  AND saved_premium IS NOT NULL;

UPDATE public.pending_cases
SET saved_premium = NULL
WHERE status = 'auto_resolved'
  AND saved_premium IS NOT NULL;
