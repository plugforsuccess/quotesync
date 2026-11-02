// src/pages/components/rate-checks/partnerPay.js
// Partner pay: a flat fee per qualified household, by which dec pages it sends —
// never by what it buys. Pure functions (no React, no Supabase) so the payout
// math can be tested and matches what the partner tab shows and exports.
// The rate-check-partner edge function carries the same rules for the portal.

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

// The agency's payout rules (rate_check_partner_rules) override these defaults.
// A household pays once the agency has quoted it, or after this long if the
// agency never got to it — a slow week at the desk shouldn't cost the partner.
export const QUOTE_DAYS = 7;
// A dec page this long past its expiration date is an old page from a drawer.
export const EXPIRED_DAYS = 30;
// Months under this carry over to the next payout.
export const MIN_PAYOUT = 50;

/** The rules when only a quote is needed (the original behavior). */
export const QUOTED_RULES = { requireCallConfirm: false, quoteDays: QUOTE_DAYS, expiredDays: EXPIRED_DAYS, minPayout: MIN_PAYOUT };
/** An agency with no saved rules: the customer must reply Y to the quote-ready text. */
export const DEFAULT_RULES = { ...QUOTED_RULES, requireCallConfirm: true };

/** The saved rules row (rate_check_partner_rules), falling back to DEFAULT_RULES. */
export function rulesFrom(row) {
  if (!row) return { ...DEFAULT_RULES };
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    requireCallConfirm: row.require_call_confirm ?? DEFAULT_RULES.requireCallConfirm,
    quoteDays: num(row.quote_days, QUOTE_DAYS),
    expiredDays: num(row.expired_days, EXPIRED_DAYS),
    minPayout: num(row.min_payout, MIN_PAYOUT),
  };
}

const DAY = 86400000;

/** { auto_home: 45, …, extra_line: 5 } from the saved rows, falling back to the defaults. */
export function scheduleFrom(rows) {
  const out = Object.fromEntries([...TIERS, EXTRA_LINE].map(t => [t.key, t.fee]));
  for (const r of rows || []) if (r?.tier in out && Number.isFinite(Number(r.amount))) out[r.tier] = Number(r.amount);
  return out;
}

const AUTO = new Set(['auto']);
const HOME = new Set(['home', 'condo']);
const RENTERS = new Set(['renters']);

/**
 * A scan counts toward pay: read, not a repeat, not thrown out, not already an
 * Allstate policy, and current (expired no more than `expiredDays` ago).
 */
export function qualifies(rc, now = Date.now(), expiredDays = EXPIRED_DAYS) {
  if (!rc?.policy_type || rc.duplicate_of != null || ['pending', 'extract_failed', 'declined'].includes(rc.status)) return false;
  if (String(rc.carrier || '').toLowerCase() === 'allstate') return false;
  if (rc.expiration_date) {
    const exp = new Date(rc.expiration_date).getTime();
    if (Number.isFinite(exp) && exp < now - expiredDays * DAY) return false;
  }
  return true;
}

/** Quoted by the agency: an Allstate price was entered (won or lost both count). */
export const quoted = (rc) => rc.allstate_premium != null || !!rc.quoted_at || ['quoted', 'won', 'lost', 'bound'].includes(rc.status);

/** The customer replied Y to the quote-ready text. */
export const callConfirmed = (rc) => !!rc.call_confirmed_at;

/** Which tier a household's qualifying pages earn, and how many extra lines on top. */
export function householdTier(scans, now = Date.now(), expiredDays = EXPIRED_DAYS) {
  const pages = (scans || []).filter(s => qualifies(s, now, expiredDays));
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

// Months are in the agency's time zone (Georgia), the same as the partner portal.
const TZ = 'America/New_York';
const monthKey = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ }).slice(0, 7);
// A month is paid on this day of the following month, so late quotes and replies are in.
export const PAY_DAY = 21;
/** "2026-10" → "2026-11-21": the day that month's households are paid. */
export const payDay = (key) => {
  const [y, m] = key.split('-').map(Number);
  const next = m === 12 ? [y + 1, 1] : [y, m + 1];
  return `${next[0]}-${String(next[1]).padStart(2, '0')}-${PAY_DAY}`;
};
/** Today in the agency's time zone, "2026-11-01". */
export const today = (now = Date.now()) => new Date(now).toLocaleDateString('en-CA', { timeZone: TZ });
/** Whether a month's pay day has come. */
export const isDue = (key, now = Date.now()) => today(now) >= payDay(key);
/** "2026-11-21" → "Nov 21" */
export const shortDate = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "2026-10" → "October" (the month's name, for "October activity") */
export const monthName = (key) => monthLabel(key).split(' ')[0];
/** "2026-10" → "October 2026" */
export const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
/** "2026-10" → "2026-10-01" (rate_check_promoter_payouts.period) */
export const monthStart = (key) => `${key}-01`;
export const currentMonth = (now = new Date()) => monthKey(new Date(now).toISOString());

const WON = new Set(['won', 'bound']);
const QUOTED = new Set(['quoted', 'won', 'lost', 'bound']);

// One household = one phone number, address or policy number; the same house
// sent under three phones is still one household.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function groupHouseholds(scans) {
  const list = scans || [];
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { parent[find(a)] = find(b); };
  const seen = new Map();
  list.forEach((rc, i) => {
    for (const key of [rc.phone && `p:${rc.phone}`, norm(rc.insured_address).length > 8 && `a:${norm(rc.insured_address)}`, norm(rc.policy_number).length > 5 && `n:${norm(rc.policy_number)}`].filter(Boolean)) {
      if (seen.has(key)) union(i, seen.get(key)); else seen.set(key, i);
    }
  });
  const groups = new Map();
  list.forEach((rc, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(rc); });
  return [...groups.values()];
}

/**
 * Every household a partner sent. A household is paid once, in the month its
 * first qualifying page arrived, at the tier all its pages earn — and only once
 * it clears the agency's rules (`pays`; until then `pending`): with
 * requireCallConfirm, once the customer replied Y to the quote-ready text;
 * otherwise once quoted or `quoteDays` after its first page.
 * Households with nothing that qualifies are listed with no fee.
 */
export function households(scans, schedule, now = Date.now(), rules = QUOTED_RULES) {
  const qualify = (s) => qualifies(s, now, rules.expiredDays);
  return groupHouseholds(scans).map(list => {
    const sorted = [...list].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const firstQualifying = sorted.find(qualify);
    const { tier, extras, pages } = householdTier(sorted, now, rules.expiredDays);
    const fee = tier ? (schedule[tier] ?? 0) + extras * (schedule.extra_line ?? 0) : 0;
    const firstAt = firstQualifying ? firstQualifying.created_at : null;
    const confirmed = sorted.some(callConfirmed);
    const pays = !!tier && (rules.requireCallConfirm
      ? confirmed
      : (sorted.some(quoted) || now - new Date(firstAt).getTime() >= rules.quoteDays * DAY));
    return {
      key: sorted[0].phone || sorted[0].id,
      firstAt,
      promoterId: sorted[0].promoter_id,
      firstName: sorted.find(s => s.first_name)?.first_name || null,
      phone: sorted[0].phone || null,
      scans: sorted,
      pages,
      types: [...new Set(sorted.filter(qualify).map(s => s.policy_type))],
      tier, extras, fee,
      pays, pending: !!tier && !pays,
      confirmed,
      texted: sorted.some(s => !!s.quote_ready_texted_at),
      month: firstQualifying ? monthKey(firstQualifying.created_at) : null,
      quoted: sorted.some(s => QUOTED.has(s.status)),
      won: sorted.some(s => WON.has(s.status)),
      boundPremium: sorted.filter(s => s.status === 'bound').reduce((t, s) => t + (Number(s.bound_premium) || 0), 0),
    };
  });
}

/**
 * A partner's monthly cap: in each month, the first `cap` payable households (by
 * when their first page arrived) are paid; the rest keep their tier but pay $0 and
 * are marked overCap. A null cap pays every household.
 */
export function applyCap(hh, cap) {
  if (!cap) return hh.map(h => ({ ...h, overCap: false }));
  const rank = new Map();
  const byMonth = {};
  // Only households that pay take a slot: ones still waiting (on a quote or a Y reply) don't use up the cap.
  for (const h of hh.filter(x => x.tier && x.month && x.pays)) (byMonth[h.month] ||= []).push(h);
  for (const list of Object.values(byMonth)) {
    list.sort((a, b) => new Date(a.firstAt) - new Date(b.firstAt)).forEach((h, i) => rank.set(h, i));
  }
  return hh.map(h => {
    const overCap = rank.has(h) && rank.get(h) >= cap;
    return overCap ? { ...h, overCap, fee: 0 } : { ...h, overCap: false };
  });
}

/** Totals for one partner: this month and all time, close rate and cost per win. */
export function partnerSummary(hh, month) {
  const paid = hh.filter(h => h.tier);
  const inMonth = paid.filter(h => h.month === month);
  const won = paid.filter(h => h.won).length;
  const fees = paid.filter(h => h.pays).reduce((t, h) => t + h.fee, 0);
  return {
    month: {
      households: inMonth.length,
      owed: inMonth.filter(h => h.pays).reduce((t, h) => t + h.fee, 0),
      pending: inMonth.filter(h => h.pending).length,
      overCap: inMonth.filter(h => h.overCap).length,
    },
    households: paid.length,
    quoted: paid.filter(h => h.quoted).length,
    won,
    closeRate: paid.length ? won / paid.length : null,
    fees,
    costPerWin: won ? fees / won : null,
    boundPremium: paid.reduce((t, h) => t + h.boundPremium, 0),
  };
}

/**
 * What to pay a partner, looking at `month`: every unpaid month up to it whose pay day
 * (the 21st of the following month) has come, and what's still to come.
 * `payouts` are the recorded payouts (period = YYYY-MM-01).
 * Returns {
 *   months: [{ month, households, amount }]  due now (record these when paying),
 *   amount, carried (the part from months before `month`), underMinimum (under the
 *   minimum: carries to the next pay day), upcoming (owed, not due yet), upcomingPayDay,
 *   later: [{ month, households, amount, payDay }] (the not-yet-due months)
 * }.
 */
export function payoutPlan(hh, payouts, month, minPayout = MIN_PAYOUT, now = Date.now()) {
  const paidMonths = new Set((payouts || []).map(p => String(p.period).slice(0, 7)));
  const owedBy = {};
  for (const h of hh) if (h.tier && h.pays && h.month && h.month <= month && !paidMonths.has(h.month)) {
    (owedBy[h.month] ||= { month: h.month, households: 0, amount: 0 });
    owedBy[h.month].households += 1;
    owedBy[h.month].amount += h.fee;
  }
  const all = Object.values(owedBy).filter(m => m.amount > 0).sort((a, b) => a.month.localeCompare(b.month));
  const months = all.filter(m => isDue(m.month, now));
  const later = all.filter(m => !isDue(m.month, now));
  const amount = months.reduce((t, m) => t + m.amount, 0);
  return {
    months, amount,
    carried: months.filter(m => m.month !== month).reduce((t, m) => t + m.amount, 0),
    underMinimum: amount > 0 && amount < minPayout,
    upcoming: later.reduce((t, m) => t + m.amount, 0),
    upcomingPayDay: later.length ? payDay(later[0].month) : null,
    // Each not-yet-due month on its own: "November activity · $45 · pays Dec 21".
    later: later.map(m => ({ ...m, payDay: payDay(m.month) })),
  };
}

/** Months that have at least one paid household, newest first (always includes `current`). */
export function monthsWithActivity(hh, current) {
  return [...new Set([current, ...hh.filter(h => h.tier && h.month).map(h => h.month)])].sort().reverse();
}

/**
 * What each partner was actually paid in a calendar year, for 1099s: the recorded
 * payouts whose paid_at falls in `year` (a 1099 counts the payment date, not the
 * month earned, so carried-over months land in the year they were paid).
 * Returns { [promoterId]: { amount, payments, months, lastPaid } }.
 */
export function paidInYear(payouts, year) {
  const by = {};
  for (const p of payouts || []) {
    if (!p.paid_at || new Date(p.paid_at).getFullYear() !== Number(year)) continue;
    const t = (by[p.promoter_id] ||= { amount: 0, paidAt: new Set(), months: [], lastPaid: null });
    t.amount += Number(p.amount) || 0;
    t.paidAt.add(p.paid_at);
    t.months.push(String(p.period).slice(0, 7));
    if (!t.lastPaid || p.paid_at > t.lastPaid) t.lastPaid = p.paid_at;
  }
  return Object.fromEntries(Object.entries(by).map(([id, t]) => [id, {
    amount: Math.round(t.amount * 100) / 100, payments: t.paidAt.size, months: t.months.sort(), lastPaid: t.lastPaid,
  }]));
}
