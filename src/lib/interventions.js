// src/lib/interventions.js
// Shared shape + DB-mapping helper for intervention capture (the save tactic
// recorded on a call attempt). Kept out of the component file so fast-refresh
// stays happy and the mapping can be reused by any logging surface.

export const EMPTY_INTERVENTION = {
  interventions: [],
  offeredPremium: '',
  competitorName: '',
  competitorQuote: '',
  discountNote: '',
};

// Codes that record WHY a reached call did NOT save the customer (not a save
// tactic). They satisfy the "tag the reached call" requirement and are kept out
// of per-tactic save-rate analytics. Mirrors intervention_types.is_loss_reason.
export const LOSS_REASON_CODES = new Set([
  'loss_price', 'loss_switched', 'loss_ineligible', 'loss_other',
]);

// Normalizes the picker's form value into the attempt-table column shape.
// Returns only populated fields so untouched attempts stay clean (all-NULL).
export function interventionInsertFields(value) {
  const v = value || EMPTY_INTERVENTION;
  const out = {};
  if (Array.isArray(v.interventions) && v.interventions.length > 0) {
    out.interventions = v.interventions;
  }
  const prem = parseFloat(v.offeredPremium);
  if (!Number.isNaN(prem)) out.offered_premium = prem;
  if (v.competitorName && v.competitorName.trim()) out.competitor_name = v.competitorName.trim();
  const cq = parseFloat(v.competitorQuote);
  if (!Number.isNaN(cq)) out.competitor_quote = cq;
  if (v.discountNote && v.discountNote.trim()) out.discount_note = v.discountNote.trim();
  return out;
}
