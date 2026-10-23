// src/pages/components/rate-checks/partnerPay.js
// Partner pay: a flat fee per qualified household, by which dec pages it sends —
// never by what it buys. Pure functions (no React, no Supabase) so the payout
// math can be tested and matches what the partner tab shows and exports.

// The agency's schedule overrides these (rate_check_promoter_rates).
export const TIERS = [
  { key: 'auto_home', label: 'Auto + home or condo', fee: 45 },
  { key: 'auto_renters', label: 'Auto + renters', fee: 15 },
  { key: 'home_only', label: 'Home or condo only', fee: 15 },
  { key: 'auto_only', label: 'Auto only', fee: 10 },
  { key: 'renters_only', label: 'Renters only', fee: 2 },
];
export const EXTRA_LINE = { key: 'extra_line', label: 'Each extra line (umbrella, a second auto policy)', fee: 5 };
export const EXTRA_LINE_CAP = 2;
export const TIER_LABEL = Object.fromEntries([...TIERS, EXTRA_LINE].map(t => [t.key, t.label]));

/** { auto_home: 35, …, extra_line: 5 } from the saved rows, falling back to the defaults. */
export function scheduleFrom(rows) {
  const out = Object.fromEntries([...TIERS, EXTRA_LINE].map(t => [t.key, t.fee]));
  for (const r of rows || []) if (r?.tier in out && Number.isFinite(Number(r.amount))) out[r.tier] = Number(r.amount);
  return out;
}

const AUTO = new Set(['auto']);
const HOME = new Set(['home', 'condo']);
const RENTERS = new Set(['renters']);

/** A scan counts toward pay: read, not a repeat, not thrown out. */
export function qualifies(rc) {
  return !!rc?.policy_type && rc.duplicate_of == null && !['pending', 'extract_failed', 'declined'].includes(rc.status);
}

/** Which tier a household's qualifying pages earn, and how many extra lines on top. */
export function householdTier(scans) {
  const pages = (scans || []).filter(qualifies);
  const has = (set) => pages.some(p => set.has(p.policy_type));
  let tier = null, base = 0;
  if (has(AUTO) && has(HOME)) { tier = 'auto_home'; base = 2; }
  else if (has(AUTO) && has(RENTERS)) { tier = 'auto_renters'; base = 2; }
  else if (has(HOME)) { tier = 'home_only'; base = 1; }
  else if (has(AUTO)) { tier = 'auto_only'; base = 1; }
  else if (has(RENTERS)) { tier = 'renters_only'; base = 1; }
  const extras = tier ? Math.min(EXTRA_LINE_CAP, Math.max(0, pages.length - base)) : 0;
  return { tier, extras, pages: pages.length };
}

const monthKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
/** "2026-10" → "October 2026" */
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
/** "2026-10" → "2026-10-01" (rate_check_promoter_payouts.period) */
export const monthStart = (key) => `${key}-01`;
export const currentMonth = (now = new Date()) => monthKey(now.toISOString());

const WON = new Set(['won', 'bound']);
const QUOTED = new Set(['quoted', 'won', 'lost', 'bound']);

/**
 * Every household a partner sent, one per phone number. A household is paid
 * once, in the month its first qualifying page arrived, at the tier all its
 * pages earn. Households with nothing that qualifies are listed with no fee.
 */
export function households(scans, schedule) {
  const byPhone = new Map();
  for (const rc of scans || []) {
    const key = rc.phone || rc.id;
    if (!byPhone.has(key)) byPhone.set(key, []);
    byPhone.get(key).push(rc);
  }
  return [...byPhone.values()].map(list => {
    const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const firstQualifying = sorted.find(qualifies);
    const { tier, extras, pages } = householdTier(sorted);
    const fee = tier ? (schedule[tier] ?? 0) + extras * (schedule.extra_line ?? 0) : 0;
    return {
      key: sorted[0].phone || sorted[0].id,
      promoterId: sorted[0].promoter_id,
      firstName: sorted.find(s => s.first_name)?.first_name || null,
      phone: sorted[0].phone || null,
      scans: sorted,
      pages,
      types: [...new Set(sorted.filter(qualifies).map(s => s.policy_type))],
      tier, extras, fee,
      month: firstQualifying ? monthKey(firstQualifying.created_at) : null,
      quoted: sorted.some(s => QUOTED.has(s.status)),
      won: sorted.some(s => WON.has(s.status)),
      boundPremium: sorted.filter(s => s.status === 'bound').reduce((t, s) => t + (Number(s.bound_premium) || 0), 0),
    };
  });
}

/** Totals for one partner: this month and all time, close rate and cost per win. */
export function partnerSummary(hh, month) {
  const paid = hh.filter(h => h.tier);
  const inMonth = paid.filter(h => h.month === month);
  const won = paid.filter(h => h.won).length;
  const fees = paid.reduce((t, h) => t + h.fee, 0);
  return {
    month: { households: inMonth.length, owed: inMonth.reduce((t, h) => t + h.fee, 0) },
    households: paid.length,
    quoted: paid.filter(h => h.quoted).length,
    won,
    closeRate: paid.length ? won / paid.length : null,
    fees,
    costPerWin: won ? fees / won : null,
    boundPremium: paid.reduce((t, h) => t + h.boundPremium, 0),
  };
}

/** Months that have at least one paid household, newest first (always includes `current`). */
export function monthsWithActivity(hh, current) {
  return [...new Set([current, ...hh.filter(h => h.tier && h.month).map(h => h.month)])].sort().reverse();
}
