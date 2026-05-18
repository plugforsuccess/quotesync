/**
 * Unit tests for computeBookAggregates (pure aggregation over snapshot rows).
 * Run with: npx vitest src/hooks/useBookSnapshot.test.js
 */
import { describe, it, expect, vi } from 'vitest';

// useBookSnapshot imports the Supabase client, which constructs a real client
// at module load. Stub it so the pure computeBookAggregates export can be
// tested in isolation without env vars.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { computeBookAggregates } from './useBookSnapshot';

const row = (over) => ({
  id: Math.random().toString(36).slice(2),
  carrier_code: 'allstate',
  carrier_name: 'Allstate',
  product_key: 'auto',
  state_code: 'GA',
  policy_count: 100,
  total_premium: 250000,
  estimated_annual_commission: 25000,
  ...over,
});

describe('computeBookAggregates', () => {
  it('returns zeros and empty arrays for an empty book', () => {
    const a = computeBookAggregates([]);
    expect(a.totalPremium).toBe(0);
    expect(a.totalPolicies).toBe(0);
    expect(a.totalCommission).toBe(0);
    expect(a.byCarrier).toEqual([]);
    expect(a.byProduct).toEqual([]);
    expect(a.byCarrierProduct).toEqual([]);
  });

  it('tolerates null/undefined input', () => {
    expect(computeBookAggregates(null).totalPremium).toBe(0);
    expect(computeBookAggregates(undefined).byCarrier).toEqual([]);
  });

  it('computes a single row at 100% share', () => {
    const a = computeBookAggregates([row()]);
    expect(a.totalPremium).toBe(250000);
    expect(a.totalPolicies).toBe(100);
    expect(a.totalCommission).toBe(25000);
    expect(a.byCarrier).toHaveLength(1);
    expect(a.byCarrier[0].premiumShare).toBe(100);
  });

  it('splits two carriers 50/50', () => {
    const a = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', total_premium: 100000 }),
      row({ carrier_code: 'progressive', carrier_name: 'Progressive', total_premium: 100000 }),
    ]);
    expect(a.byCarrier).toHaveLength(2);
    expect(a.byCarrier[0].premiumShare).toBe(50);
    expect(a.byCarrier[1].premiumShare).toBe(50);
  });

  it('groups one carrier with three products', () => {
    const a = computeBookAggregates([
      row({ product_key: 'auto', total_premium: 100000 }),
      row({ product_key: 'ho', total_premium: 80000 }),
      row({ product_key: 'renters', total_premium: 20000 }),
    ]);
    expect(a.byCarrier).toHaveLength(1);
    expect(a.byProduct).toHaveLength(3);
    expect(a.byProduct[0].product_key).toBe('auto'); // sorted by premium desc
  });
});
