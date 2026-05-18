/**
 * Unit tests for the pure transforms in useTerminationReasonAnalytics.
 * Run with: npx vitest src/hooks/useTerminationReasonAnalytics.test.js
 */
import { describe, it, expect, vi } from 'vitest';

// The hook module imports the Supabase client at load time. Stub it so the
// pure exports can be tested in isolation without env vars.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import {
  buildMonthlySeries,
  aggregateByCategory,
  compareWithPrior,
} from './useTerminationReasonAnalytics';

const CATEGORIES = [
  { code: 'price', display_name: 'Price', color_token: '#EF4444', action_class: 'preventable' },
  { code: 'non_payment', display_name: 'Non-Payment', color_token: '#F97316', action_class: 'preventable' },
  { code: 'other', display_name: 'Other', color_token: '#94A3B8', action_class: 'external' },
];

const row = (month, code, premium, items = 1) => ({
  report_month: month,
  premium,
  item_count: items,
  termination_reason: code,
  termination_reason_categories: { code },
});

describe('buildMonthlySeries', () => {
  it('returns empty array for empty rows', () => {
    expect(buildMonthlySeries([], CATEGORIES)).toEqual([]);
  });

  it('returns empty array for non-array inputs', () => {
    expect(buildMonthlySeries(null, CATEGORIES)).toEqual([]);
    expect(buildMonthlySeries([], null)).toEqual([]);
  });

  it('builds a sorted, zero-filled series across 3 months and 2 categories', () => {
    const rows = [
      row('2026-01', 'price', 100),
      row('2026-01', 'non_payment', 200),
      row('2026-02', 'price', 50),
      row('2026-03', 'non_payment', 300, 2),
    ];
    const series = buildMonthlySeries(rows, CATEGORIES);

    expect(series.map(s => s.month)).toEqual(['2026-01', '2026-02', '2026-03']);

    // Every month has all category codes zero-filled
    for (const m of series) {
      expect(Object.keys(m.byCategory).sort()).toEqual(['non_payment', 'other', 'price']);
    }

    expect(series[0].byCategory.price).toEqual({ count: 1, premium: 100, items: 1 });
    expect(series[0].byCategory.non_payment).toEqual({ count: 1, premium: 200, items: 1 });
    expect(series[0].byCategory.other).toEqual({ count: 0, premium: 0, items: 0 });
    expect(series[0].total).toEqual({ count: 2, premium: 300, items: 2 });

    expect(series[2].byCategory.non_payment).toEqual({ count: 1, premium: 300, items: 2 });
    expect(series[2].total).toEqual({ count: 1, premium: 300, items: 2 });
  });

  it('normalizes DATE-style report_month (YYYY-MM-01) to YYYY-MM', () => {
    const rows = [row('2026-03-01', 'price', 100)];
    const series = buildMonthlySeries(rows, CATEGORIES);
    expect(series).toHaveLength(1);
    expect(series[0].month).toBe('2026-03');
    expect(series[0].byCategory.price.count).toBe(1);
  });
});

describe('aggregateByCategory', () => {
  it('sums across months and zero-fills missing categories', () => {
    const rows = [
      row('2026-01', 'price', 100),
      row('2026-02', 'price', 50),
      row('2026-02', 'non_payment', 400),
    ];
    const series = buildMonthlySeries(rows, CATEGORIES);
    const agg = aggregateByCategory(series, CATEGORIES);

    const byCode = Object.fromEntries(agg.map(a => [a.code, a]));
    expect(byCode.price.count).toBe(2);
    expect(byCode.price.premium).toBe(150);
    expect(byCode.non_payment.count).toBe(1);
    expect(byCode.non_payment.premium).toBe(400);
    // zero-filled category still present
    expect(byCode.other.count).toBe(0);
  });

  it('sorts by premium desc and shares sum to ~100%', () => {
    const rows = [
      row('2026-01', 'price', 100),
      row('2026-01', 'non_payment', 400),
    ];
    const agg = aggregateByCategory(buildMonthlySeries(rows, CATEGORIES), CATEGORIES);

    expect(agg[0].code).toBe('non_payment'); // highest premium first

    const premiumShareSum = agg.reduce((s, a) => s + a.premiumShare, 0);
    const countShareSum = agg.reduce((s, a) => s + a.countShare, 0);
    expect(Math.round(premiumShareSum)).toBe(100);
    expect(Math.round(countShareSum)).toBe(100);
  });

  it('returns zeros without dividing by zero when there is no data', () => {
    const agg = aggregateByCategory(buildMonthlySeries([], CATEGORIES), CATEGORIES);
    expect(agg.every(a => a.count === 0 && a.premiumShare === 0 && a.countShare === 0)).toBe(true);
  });
});

describe('compareWithPrior', () => {
  const mkAgg = (code, count, premium) => ({
    code, display_name: code, color_token: '#000', action_class: 'preventable',
    count, premium, items: count, countShare: 0, premiumShare: 0,
  });

  it('sets priorCount 0 and deltaPct null when category absent in prior', () => {
    const current = [mkAgg('price', 10, 1000)];
    const prior = [];
    const [c] = compareWithPrior(current, prior);
    expect(c.priorCount).toBe(0);
    expect(c.priorPremium).toBe(0);
    expect(c.deltaCount).toBe(10);
    expect(c.deltaPct).toBeNull();
  });

  it('computes deltaPct = ((current - prior) / prior) * 100 when present in both', () => {
    const current = [mkAgg('price', 12, 1200)];
    const prior = [mkAgg('price', 10, 1000)];
    const [c] = compareWithPrior(current, prior);
    expect(c.priorCount).toBe(10);
    expect(c.deltaCount).toBe(2);
    expect(c.deltaPct).toBeCloseTo(20);
  });

  it('deltaCount always equals current minus prior', () => {
    const current = [mkAgg('price', 5, 500), mkAgg('non_payment', 3, 300)];
    const prior = [mkAgg('price', 8, 800), mkAgg('non_payment', 1, 100)];
    const result = compareWithPrior(current, prior);
    const byCode = Object.fromEntries(result.map(r => [r.code, r]));
    expect(byCode.price.deltaCount).toBe(-3);
    expect(byCode.non_payment.deltaCount).toBe(2);
  });
});
