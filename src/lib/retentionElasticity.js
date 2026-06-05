// src/lib/retentionElasticity.js
// The "brain": turns ingested book metrics into expected saveable premium, so
// the queue can rank by where a call actually moves the needle — not by date.
//
//   expected saveable premium = annual premium
//                             × churn probability  (observed retention, by segment + rate band)
//                             × save lift           (fraction of would-be churners a call recovers)
//
// Churn is grounded in REAL data today: the Premium & Profitability report gives
// observed retention by product and tenure band. Save lift starts as a prior
// and refines as intervention→outcome data accumulates (see SAVE_LIFT_DEFAULT).
//
// Pure + framework-free so it's unit-testable and reusable by any surface.

import { CURRENT_YEAR } from './retentionPriority';

// Fraction of would-be churners that a proactive save call recovers. Starts as
// a deliberately conservative prior; once intervention capture has enough
// observed (tactic → outcome) data, this becomes a learned, per-tactic number.
export const SAVE_LIFT_DEFAULT = 0.30;

// Fallback churn priors by normalized product when no observed snapshot exists
// (new tenant, or a product missing from the report). Loosely reflects typical
// personal-lines retention. Replaced by observed retention as soon as a P&P
// report is ingested.
const DEFAULT_CHURN = {
  auto: 0.18, specialty_auto: 0.12, ho: 0.12, condo: 0.10, renters: 0.32,
  landlord: 0.15, pup: 0.10, boat: 0.15, manufactured: 0.18, motor_club: 0.25,
  other: 0.18,
};
const DEFAULT_CHURN_FALLBACK = 0.18;

function tenureBand(originalYear) {
  if (!originalYear) return 'unknown';
  const t = CURRENT_YEAR - originalYear;
  if (t <= 2) return '0_2';
  if (t <= 5) return '2_5';
  return '5plus';
}

// Build a churn model keyed by product_key from book_snapshots product rows.
// Each entry carries overall churn + tenure-band churn (1 - retention).
// `products` is the array returned by useBookSnapshots().products.
export function buildChurnModel(products = []) {
  const model = {};
  for (const p of products) {
    if (!p.product_key || p.is_rollup) continue;       // skip the auto rollup row
    const toChurn = (pct) => (pct == null ? null : Math.max(0, Math.min(1, (100 - pct) / 100)));
    model[p.product_key] = {
      overall: toChurn(p.policy_retention_pct),
      '0_2':   toChurn(p.tenure_ret_0_2),
      '2_5':   toChurn(p.tenure_ret_2_5),
      '5plus': toChurn(p.tenure_ret_5plus),
    };
  }
  return model;
}

// Rate-shock multiplier: a large renewal increase pushes a customer well above
// their segment's *average* churn. Multiplies the observed segment churn.
function rateShockMultiplier(changePct) {
  const c = changePct || 0;
  if (c >= 25) return 1.8;
  if (c >= 20) return 1.6;
  if (c >= 15) return 1.4;
  if (c >= 10) return 1.2;
  if (c >= 5)  return 1.05;
  if (c > 0)   return 1.0;
  return 0.85;                                          // flat/decrease — lower risk
}

// Churn probability for a single renewal case, blending observed segment churn
// (product × tenure) with the rate-shock multiplier. Falls back to priors.
export function churnProbability(event, model = {}) {
  const key = event.product_key || event.product || 'other';
  const seg = model[key];
  const band = tenureBand(event.original_year);

  let base;
  if (seg) {
    base = seg[band] ?? seg.overall ?? DEFAULT_CHURN[key] ?? DEFAULT_CHURN_FALLBACK;
  } else {
    base = DEFAULT_CHURN[key] ?? DEFAULT_CHURN_FALLBACK;
  }
  const churn = base * rateShockMultiplier(event.premium_change_pct);
  return Math.max(0, Math.min(0.95, churn));
}

// Expected saveable premium in dollars for a renewal case.
export function expectedSaveablePremium(event, model = {}, saveLift = SAVE_LIFT_DEFAULT) {
  const premium = parseFloat(event.premium) || 0;
  if (premium <= 0) return 0;
  return premium * churnProbability(event, model) * saveLift;
}

// Whether the churn model is backed by real observed data (vs. priors only).
export function modelIsObserved(model = {}) {
  return Object.values(model).some((seg) => seg && seg.overall != null);
}
