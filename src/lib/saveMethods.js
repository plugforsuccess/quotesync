// src/lib/saveMethods.js
// "What saved the customer" — the primary tactic captured at the moment a
// renewal is confirmed or a cancellation is saved. Stored on the case
// (renewal_cases.save_method / pending_cases.save_method) so saves are
// queryable by tactic ("how many did we keep via a company transfer?").
// Company transfer (moving the policy to a different writing company/tier for a
// better rate) is a first-class, critical retention method, so it leads.

export const SAVE_METHODS = [
  { value: 'company_transfer',  label: 'Company transfer' },
  { value: 'requote',           label: 'Re-quote (deductible / coverage)' },
  { value: 'bundle',            label: 'Bundled policies' },
  { value: 'discount',          label: 'Applied a discount' },
  { value: 'competitor_match',  label: 'Matched a competitor' },
  { value: 'payment_plan',      label: 'Payment plan / EFT' },
  { value: 'reinstatement',     label: 'Reinstated (paid balance)' },
  { value: 'rewrite',           label: 'Rewrote the policy' },
  { value: 'explained_increase', label: 'Explained the increase' },
  { value: 'retention_offer',   label: 'Retention offer / exception' },
  { value: 'other',             label: 'Other' },
];

export const SAVE_METHOD_LABEL = Object.fromEntries(
  SAVE_METHODS.map(m => [m.value, m.label])
);
