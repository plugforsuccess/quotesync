// src/pages/components/rate-checks/quoteMath.js
// The payoff numbers for the drawer's quote cards: what the household pays now
// (the number to beat), how many policies are quoted, and what Allstate saves
// them so far. Pure functions so the goal header, household chips and live
// delta all agree. Whole dollars throughout.

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Saving on one policy: { delta, pct } (delta > 0 = they save), or null without both prices. */
export function savings(current, price) {
  const c = num(current), p = num(price);
  if (c == null || p == null || p <= 0) return null;
  const delta = Math.round(c - p);
  return { delta, pct: c > 0 ? Math.round((delta / c) * 100) : null };
}

/**
 * Across the household: { target, quoted, total, saved, bundleAllstate, bundleCurrent }.
 * target = what all policies cost now; saved = Σ (current − Allstate) over quoted
 * policies that have a current price; bundle* = the quoted policies only.
 */
export function householdGoal(policies) {
  const list = policies || [];
  const priced = list.filter(p => num(p.annual_premium) != null);
  const target = priced.length ? Math.round(priced.reduce((t, p) => t + num(p.annual_premium), 0)) : null;
  const quoted = list.filter(p => num(p.allstate_premium) != null && num(p.allstate_premium) > 0);
  const compared = quoted.filter(p => num(p.annual_premium) != null);
  return {
    target,
    quoted: quoted.length,
    total: list.length,
    saved: compared.length ? compared.reduce((t, p) => t + savings(p.annual_premium, p.allstate_premium).delta, 0) : null,
    bundleAllstate: quoted.length ? Math.round(quoted.reduce((t, p) => t + num(p.allstate_premium), 0)) : null,
    bundleCurrent: compared.length ? Math.round(compared.reduce((t, p) => t + num(p.annual_premium), 0)) : null,
  };
}

/** A price this far under what they pay now is more likely a typo or thinner coverage. */
export const BIG_DROP = 0.25;
export const looksTooLow = (current, price) => {
  const c = num(current), p = num(price);
  return c != null && p != null && p > 0 && p < c * BIG_DROP;
};
