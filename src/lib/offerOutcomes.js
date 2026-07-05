// src/lib/offerOutcomes.js
// Aggregates offer_outcomes view rows (attempts that carried an offered premium
// or competitor quote, joined to the case outcome) into the numbers the Offers
// report shows: acceptance rate, the premium quoted-but-lost, per-tactic offer
// performance, and competitor intel. Pure + framework-free so it's unit-testable.

import { LOSS_REASON_CODES, NEUTRAL_CODES } from './interventions.js';

const num = (v) => {
  if (v == null || v === '') return null; // Number(null) is 0 — don't count a missing quote as $0
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// Save tactics only — loss reasons / neutral tags on the same attempt don't
// describe an offer, so they stay out of the per-tactic breakdown.
const saveTactics = (row) =>
  (row.interventions || []).filter((c) => c && !LOSS_REASON_CODES.has(c) && !NEUTRAL_CODES.has(c));

export function summarizeOfferOutcomes(rows = []) {
  const quoted = rows.filter((r) => num(r.offered_premium) != null);
  const accepted = quoted.filter((r) => r.outcome === 'saved');
  const lost = quoted.filter((r) => r.outcome === 'lost');
  const open = quoted.filter((r) => r.outcome === 'open');
  const resolved = accepted.length + lost.length;

  const lostQuotedPremium = lost.reduce((s, r) => s + num(r.offered_premium), 0);

  // Concession = how far below the premium on the table the quote landed
  // (positive = we offered a discount). Split by outcome so the report can say
  // "saves took an average X% concession; the quotes that lost averaged Y%."
  const concessionPct = (r) => {
    const base = num(r.case_premium);
    const offered = num(r.offered_premium);
    if (base == null || offered == null || base <= 0) return null;
    return ((base - offered) / base) * 100;
  };
  const avgConcession = (rs) => {
    const vals = rs.map(concessionPct).filter((v) => v != null);
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  };

  // Per-tactic offer performance (only attempts that carried a quote).
  const perTactic = {};
  for (const r of quoted) {
    for (const code of saveTactics(r)) {
      const t = (perTactic[code] ||= { code, quoted: 0, saved: 0, lost: 0, concessions: [] });
      t.quoted += 1;
      if (r.outcome === 'saved') t.saved += 1;
      if (r.outcome === 'lost') t.lost += 1;
      const c = concessionPct(r);
      if (c != null) t.concessions.push(c);
    }
  }
  const tactics = Object.values(perTactic)
    .map((t) => ({
      code: t.code,
      quoted: t.quoted,
      saved: t.saved,
      lost: t.lost,
      acceptRate: t.saved + t.lost > 0 ? t.saved / (t.saved + t.lost) : null,
      avgConcessionPct: t.concessions.length
        ? t.concessions.reduce((s, v) => s + v, 0) / t.concessions.length
        : null,
    }))
    .sort((a, b) => b.quoted - a.quoted);

  // Competitor intel — every attempt where the customer shared a quote.
  // gap = competitor quote − the premium on the table (negative = they undercut us).
  const byCompetitor = {};
  for (const r of rows) {
    const cq = num(r.competitor_quote);
    if (cq == null) continue;
    const name = (r.competitor_name || '').trim() || 'Unnamed';
    const c = (byCompetitor[name] ||= { name, quotes: 0, saved: 0, lost: 0, gaps: [] });
    c.quotes += 1;
    if (r.outcome === 'saved') c.saved += 1;
    if (r.outcome === 'lost') c.lost += 1;
    const base = num(r.case_premium);
    if (base != null) c.gaps.push(cq - base);
  }
  const competitors = Object.values(byCompetitor)
    .map((c) => ({
      name: c.name,
      quotes: c.quotes,
      saved: c.saved,
      lost: c.lost,
      avgGap: c.gaps.length ? c.gaps.reduce((s, v) => s + v, 0) / c.gaps.length : null,
    }))
    .sort((a, b) => b.quotes - a.quotes);

  return {
    quoted: quoted.length,
    accepted: accepted.length,
    lost: lost.length,
    open: open.length,
    acceptRate: resolved > 0 ? accepted.length / resolved : null,
    lostQuotedPremium,
    avgConcessionSavedPct: avgConcession(accepted),
    avgConcessionLostPct: avgConcession(lost),
    tactics,
    competitors,
    lostRows: lost, // the crown rows: the quotes that failed to save them
  };
}
