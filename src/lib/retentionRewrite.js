// src/lib/retentionRewrite.js
// Shared "is this termination actually a retained rewrite/transfer?" check.
//
// When a policy is rewritten or transferred to a NEW policy number (Allstate
// codes this "Cancel/Rewrite"), the OLD policy number cancels and shows up on
// the Termination report — but the customer was KEPT, not lost. Allstate's
// book-level Net Retention already counts these as retained; our per-policy
// cross-reference logic must agree, or it wrongly marks the renewal/cancel
// case LOST when the old number drops off the audit.
//
// This mirrors the rewrite rules in the DB categorizer
// (categorize_termination_reason → 'rewritten'), so the client import path
// agrees with the server taxonomy. The authoritative reconciliation
// (reconcile_renewal_outcomes) keys on the 'rewritten' category directly.
export function isRewriteReason(reason) {
  if (!reason) return false;
  const r = String(reason).toLowerCase();
  return (
    r.includes('rewrit') ||                 // "Cancel/Rewrite", "Rewritten"
    r.includes('re-writ') ||                // "Re-write"
    r.includes('another policy') ||         // "Cancel/Refund to Another Policy"
    r.includes('property with allstate') || // rebought WITH Allstate
    r.includes('internal')                  // "Company Transfer (internal)"
  );
}
