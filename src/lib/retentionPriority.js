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

// Priority tier for pending cancels — coarse, premium-weighted urgency bucket.
// P0: already lapsed.  P1: past due/≤7d AND ≥$2k premium.  P2: past due/≤7d AND <$2k.
// P3: not yet urgent (>7 days out).
// $2k threshold ≈ $468 in agency commission at ~23.4% blended.
export function computePriorityTier(row, today = new Date()) {
  const stage = row.stage || 'pending_cancel';
  if (stage === 'cancelled') return 'P0';

  const cancelDate = row.cancel_effective_date
    ? new Date(row.cancel_effective_date)
    : null;
  if (!cancelDate || isNaN(cancelDate)) return 'P3';

  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const daysUntil = Math.ceil((cancelDate - startOfToday) / 86400000);

  if (daysUntil <= 7) {
    const premium = parseFloat(row.premium_at_risk) || 0;
    return premium >= 2000 ? 'P1' : 'P2';
  }
  return 'P3';
}

export const TIER_ORDER = { P0: 0, P1: 1, P2: 2, P3: 3 };

// Sort comparator: priority tier (P0 first), then premium desc, then cancel date asc.
export function compareByTier(a, b) {
  const tierDiff = (TIER_ORDER[a.priority_tier] ?? 4) - (TIER_ORDER[b.priority_tier] ?? 4);
  if (tierDiff !== 0) return tierDiff;

  const premDiff = (parseFloat(b.premium_at_risk) || 0) - (parseFloat(a.premium_at_risk) || 0);
  if (premDiff !== 0) return premDiff;

  return (a.cancel_effective_date || '').localeCompare(b.cancel_effective_date || '');
}

export function calcRenewalPriority(event) {
  const days        = daysUntilRenewal(event.renewal_date);
  const changePct   = event.premium_change_pct || 0;
  const tenure      = event.original_year ? CURRENT_YEAR - event.original_year : 0;
  const itemCount   = event.item_count || 1;
  const product     = event.product || 'other';

  // Time factor (0-100) — anchored to the Allstate renewal billing timeline.
  // Cases are posted at 45 days out; the insured is billed at 21 days out,
  // leaving a 24-day proactive window (45→21) to retain them before the bill.
  // Priority ramps up across that window and peaks as the 21-day bill deadline
  // approaches, stays high through the post-bill human save window, and is low
  // before the case is even posted.
  const timeFactor =
    days <= 0  ? 100 :  // renewed / lapsing now
    days <= 21 ? 92  :  // bill is out — urgent human save window
    days <= 30 ? 100 :  // 22–30d: prime proactive window, bill imminent — call now
    days <= 38 ? 82  :  // 31–38d: mid proactive window
    days <= 45 ? 68  :  // 39–45d: just posted — begin proactive outreach
                 10;    // >45d: not yet posted by Allstate

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

  // Multi-item boost: a multi-vehicle household is worth far more (more premium,
  // more lines to lose, stickier once retained), so it must outrank comparable
  // single-car renewals. Scales with vehicle/item count and is large enough to
  // dominate in normal cases, while urgency (timeFactor, 40% weight) can still
  // surface an imminent single-car lapse. +12 per extra item, capped at +36.
  const multiItemBoost = itemCount >= 2 ? Math.min((itemCount - 1) * 12, 36) : 0;

  // Weights: time 40%, shopping 25%, tenure 20%, value 10%, modifiers flat
  // Weights sum to 0.95 — remaining 0.05 absorbed by modifiers (capped at 100)
  return Math.min(100, Math.round(
    (timeFactor    * 0.40) +
    (shoppingFactor * 0.25) +
    (tenureFactor  * 0.20) +
    (valueFactor   * 0.10) +
    multiLineModifier +
    paymentModifier +
    multiItemBoost
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
