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

// Neutral: reached them but nothing was resolved (still working it). Neither a
// save tactic nor a loss — satisfies the capture requirement, excluded from both
// save-rate and loss analytics. Mirrors intervention_types.is_neutral.
export const NEUTRAL_CODES = new Set(['spoke_no_decision']);

// Positive-but-not-a-save: the customer was already happy and simply confirmed
// the renewal. Stored is_neutral (excluded from save-tactic analytics), but the
// renewal resolves as renewed-NOT-credited so it never counts as a rep save.
export const HAPPY_CODES = new Set(['happy_with_policy']);

// The distinct SAVE tactics already captured across a case's call attempts —
// the single source of truth for "what we did." Loss reasons and neutral
// "no-decision" tags are excluded. This is what the close screen reads to show
// "tactic(s) on record" and to ask which one sealed the save.
export function onRecordSaveTactics(attempts) {
  const set = new Set();
  for (const a of attempts || []) {
    for (const c of a.interventions || []) {
      if (c && !LOSS_REASON_CODES.has(c) && !NEUTRAL_CODES.has(c)) set.add(c);
    }
  }
  return [...set];
}

// Tagging a quote-claiming tactic (captures_premium in intervention_types —
// re-quote / bundle / competitor match) asserts a number was put in front of
// the customer, so that number is required to log the call. Tactics that don't
// inherently quote (discount, payment plan, explained increase) stay exempt,
// and "haven't quoted yet" has its own correct tag: spoke_no_decision.
export function missingRequiredQuote(value, types = []) {
  const v = value || EMPTY_INTERVENTION;
  const selected = v.interventions || [];
  const claimsQuote = types.some((t) => selected.includes(t.code) && t.captures_premium);
  if (!claimsQuote) return false;
  const n = Number(v.offeredPremium);
  return !(Number.isFinite(n) && n > 0);
}

// The most recent at-call quote on a case, read from its attempt log (callers
// order attempts newest-first). Used to pre-fill the close screen's saved
// premium so the rep who quoted at the call never types the number twice —
// which was the friction that got the capture switched off in the first place.
export function latestOfferedPremium(attempts) {
  for (const a of attempts || []) {
    const v = Number(a?.offered_premium);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

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
