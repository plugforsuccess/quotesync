// src/lib/saveMethods.js
// "What saved the customer" — the primary tactic captured at the moment a
// renewal is confirmed or a cancellation is saved. Stored on the case
// (renewal_cases.save_method / pending_cases.save_method) so saves are
// queryable by tactic ("how many did we keep via a company transfer?").
// Company transfer (moving the policy to a different writing company/tier for a
// better rate) is a first-class, critical retention method, so it leads.

// `cancelOnly`     — only meaningful on a pending-cancel save (not renewals).
// `cancelledOnly`  — only when the policy has already CANCELLED (stage cancelled):
//                    reinstatement is paying *after* a cancel, distinct from
//                    "Paid past due" which is paying *before* the policy cancels.
export const SAVE_METHODS = [
  { value: 'company_transfer',  label: 'Company transfer' },
  { value: 'paid_past_due',     label: 'Paid past due (before cancel)', cancelOnly: true },
  { value: 'requote',           label: 'Re-quote (deductible / coverage)' },
  { value: 'bundle',            label: 'Bundled policies' },
  { value: 'discount',          label: 'Applied a discount' },
  { value: 'competitor_match',  label: 'Matched a competitor' },
  { value: 'payment_plan',      label: 'Payment plan / EFT' },
  { value: 'reinstatement',     label: 'Reinstated (paid after cancel)', cancelOnly: true, cancelledOnly: true },
  { value: 'rewrite',           label: 'Rewrote the policy', cancelOnly: true },
  { value: 'explained_increase', label: 'Explained the increase' },
  { value: 'retention_offer',   label: 'Retention offer / exception' },
  { value: 'other',             label: 'Other' },
];

export const SAVE_METHOD_LABEL = Object.fromEntries(
  SAVE_METHODS.map(m => [m.value, m.label])
);

// Methods to offer on a pending-cancel save, gated by whether the policy has
// already cancelled: reinstatement only once cancelled; "Paid past due" only
// before it cancels.
export function cancelSaveMethods(stage) {
  const lapsed = stage === 'cancelled';
  return SAVE_METHODS.filter(m => {
    if (m.value === 'reinstatement') return lapsed;
    if (m.value === 'paid_past_due') return !lapsed;
    return true;
  });
}

// Methods to offer on a renewal confirm — drop the cancel-specific ones.
export function renewalSaveMethods() {
  return SAVE_METHODS.filter(m => !m.cancelOnly);
}

// ── Attempt tactic → case save_method ───────────────────────────────────────
// The save tactic is captured once, on the call attempt ("What did you do to
// save them?", a multi-select from intervention_types). The case-level
// save_method is auto-derived from it so the rep never enters the tactic twice.
// This maps the per-attempt intervention vocabulary onto the case vocabulary.
export const INTERVENTION_TO_SAVE_METHOD = {
  company_transfer:   'company_transfer',
  requote_deductible: 'requote',
  requote_coverage:   'requote',
  bundle:             'bundle',
  discount:           'discount',
  competitor_match:   'competitor_match',
  payment_plan:       'payment_plan',
  explained_increase: 'explained_increase',
  escalated:          'retention_offer', // escalating to the principal secures an exception/offer
  paid_past_due:      'paid_past_due',    // cancel-only: paid the past-due balance before cancel
  reinstatement:      'reinstatement',    // cancel-only: paid after the policy cancelled
  other:              'other',
};

// When one call recorded several tactics, this is the order we treat as the
// "headline" reason the customer stayed (most decisive first). The cancel-only
// tactics (paying past due / reinstating) are decisive saves, so they rank high.
const INTERVENTION_PRIORITY = [
  'reinstatement', 'paid_past_due', 'company_transfer', 'competitor_match',
  'requote_deductible', 'requote_coverage', 'bundle', 'discount', 'payment_plan',
  'explained_increase', 'escalated', 'other',
];

// Given the intervention codes captured on the save (the "What did you do to
// save them?" chips), return the single "headline" case-level save_method.
// Null when no tactic was recorded.
export function saveMethodFromCodes(codes) {
  const arr = Array.isArray(codes) ? codes.filter(Boolean) : [];
  if (arr.length === 0) return null;
  const primary = INTERVENTION_PRIORITY.find(c => arr.includes(c)) || arr[0];
  return INTERVENTION_TO_SAVE_METHOD[primary] || 'other';
}
