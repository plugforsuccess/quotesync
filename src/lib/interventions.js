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
