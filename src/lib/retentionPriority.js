// ─── Retention Priority Scoring ─────────────────────────────────────────────
// Shared scoring functions for renewal and pending cancel triage tables.

import { getPortfolioPoints } from './lapseConstants';

export const CURRENT_YEAR = new Date().getFullYear();

// Tenure churn risk factor (0-100).
// Retention is lowest for 0-5yr customers — they haven't built loyalty
// inertia and are most likely to leave after a rate increase or missed payment.
// Applies to renewals only — pending cancels don't currently have original_year.
export function getTenureFactor(originalYear) {
  if (!originalYear) return 60; // unknown — treat as moderate risk
  const tenure = CURRENT_YEAR - originalYear;
  if (tenure <= 1)  return 85;
  if (tenure <= 2)  return 90; // peak churn window
  if (tenure <= 5)  return 75;
  if (tenure <= 10) return 50;
  if (tenure <= 20) return 35;
  return 20;
}

function daysUntilRenewal(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

export function daysUntilCancel(dateStr) {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  return Math.ceil((d - today) / 86400000);
}

export function calcRenewalPriority(event) {
  const days        = daysUntilRenewal(event.renewal_date);
  const changePct   = event.premium_change_pct || 0;
  const tenure      = event.original_year ? CURRENT_YEAR - event.original_year : 0;
  const itemCount   = event.item_count || 1;
  const product     = event.product || 'other';

  // Time factor (0-100) — deadline is the dominant signal
  const timeFactor =
    days <= 0  ? 100 :
    days <= 7  ? 95  :
    days <= 14 ? 70  :
    days <= 21 ? 40  :
    days <= 30 ? 20  : 5;

  // Shopping propensity (0-100) — rate increase drives comparison shopping
  const shoppingFactor =
    changePct >= 20 ? 100 :
    changePct >= 15 ? 85  :
    changePct >= 10 ? 65  :
    changePct >= 5  ? 30  :
    changePct > 0   ? 10  : 0;

  // Tenure churn risk (0-100) — short tenure = highest risk, long tenure = inertia
  const tenureFactor =
    tenure <= 1  ? 85 :  // 0-1 yr: highest churn risk
    tenure <= 2  ? 90 :  // 1-2 yr: peak churn window
    tenure <= 5  ? 75 :  // 2-5 yr: still elevated
    tenure <= 10 ? 50 :  // 5-10 yr: loyalty building
    tenure <= 20 ? 35 :  // 10-20 yr: established relationship
                   20;   // 20+ yr: strong inertia

  // Portfolio value factor (0-100) — based on points at risk, not raw premium.
  // Points incorporate both product weight (HO=20, auto=10 per item) and item count.
  // A 4-vehicle auto = 40 pts. A HO = 20 pts. A renters = 5 pts.
  // Normalized: 50 pts = score of 100. Capped at 100.
  const pts = getPortfolioPoints(product, null) * itemCount;
  const valueFactor = Math.min((pts / 0.5), 100); // 50 pts → 100

  // Multi-line modifier: bundled customers have hidden exposure (property follows auto)
  // Monoline customers are lower retention risk but cross-sell opportunity
  const multiLineModifier =
    event.multi_line === 'Yes' ? +10 :  // bundled — elevated, property at risk too
    event.multi_line === 'No'  ? -5  :  // monoline — slightly lower priority
    0;                                   // property lines or unknown — neutral

  // Easy Pay modifier: autopay = renewal inertia, deprioritize slightly
  const paymentModifier = event.easy_pay === true ? -15 : 0;

  // Weights: time 40%, shopping 25%, tenure 20%, value 10%, modifiers flat
  // Weights sum to 0.95 — remaining 0.05 absorbed by modifiers (capped at 100)
  return Math.min(100, Math.round(
    (timeFactor    * 0.40) +
    (shoppingFactor * 0.25) +
    (tenureFactor  * 0.20) +
    (valueFactor   * 0.10) +
    multiLineModifier +
    paymentModifier
  ));
}

export function calcCancelPriority(event) {
  const days = daysUntilCancel(event.cancel_effective_date);
  const premium = event.premium_at_risk || 0;
  const attempts = event.attempt_count || 0;
  const cycle = event.cycle || 1;

  // Promise status overrides — time-sensitive follow-ups go to top
  if (event.status === 'promise_to_pay' && event.promise_date) {
    const daysToPromise = Math.ceil(
      (new Date(event.promise_date) - new Date()) / 86400000
    );
    if (daysToPromise <= 1) return 100;
    if (daysToPromise <= 3) return 95;
  }
  if (event.status === 'promise_broken') return 90;
  if (event.status === 'payment_plan_requested') return 85;

  // Terminal statuses — exclude from active scoring
  if (['saved','lost','auto_resolved','requested_cancellation'].includes(event.status)) return 0;

  // Time factor (0-100): cancel date is a hard deadline
  const timeFactor =
    days <= 0  ? 100 :
    days <= 3  ? 95  :
    days <= 7  ? 80  :
    days <= 14 ? 55  :
    days <= 21 ? 30  : 10;

  // Value factor (0-100): premium at risk
  const valueFactor = Math.min((premium / 50), 100);

  // Attempt factor: unworked cases surface first, unreachable cases drop
  const attemptFactor =
    attempts === 0 ? 80 :
    attempts === 1 ? 50 :
    attempts === 2 ? 30 :
    attempts >= 3  ? 10 : 10;

  // Cycle factor: first appearance = unknown risk, chronic repeat = lower ROI.
  // NOTE: For pending cancels, tenure churn risk (0-5yr customers most likely
  // to leave permanently after a cancel event) is captured implicitly through
  // cycle — a 1-year customer who cancels is less likely to return than a
  // 10-year customer, but we don't have original_year on pending_cases.
  // If original_year is added to the pending cancel report in the future,
  // apply the same tenure bracket logic as calcRenewalPriority.
  const cycleFactor =
    cycle === 1 ? 60 :
    cycle === 2 ? 40 :
    cycle >= 3  ? 20 : 20;

  const score = Math.round(
    (timeFactor    * 0.45) +
    (valueFactor   * 0.30) +
    (attemptFactor * 0.15) +
    (cycleFactor   * 0.10)
  );

  const stageBoost = event.stage === 'cancelled' ? 15 : 0;
  return Math.min(100, score + stageBoost);
}
