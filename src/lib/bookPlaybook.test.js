/**
 * Unit tests for the Multi-Carrier Playbook rule engine.
 * Run with: npx vitest src/lib/bookPlaybook.test.js
 */
import { describe, it, expect, vi } from 'vitest';

// computeBookAggregates lives in useBookSnapshot, which imports the Supabase
// client at module load. Stub it so we can build aggregates in isolation.
vi.mock('./supabase', () => ({ supabase: {} }));

import { generateMoves } from './bookPlaybook';
import { computeBookAggregates } from '../hooks/useBookSnapshot';

const row = (over) => ({
  id: Math.random().toString(36).slice(2),
  carrier_code: 'allstate',
  carrier_name: 'Allstate',
  product_key: 'renters',
  state_code: 'GA',
  policy_count: 10,
  total_premium: 10000,
  estimated_annual_commission: 1000,
  ...over,
});

describe('generateMoves', () => {
  it('returns no moves for an empty book', () => {
    expect(generateMoves(computeBookAggregates([]))).toEqual([]);
  });

  it('flags single-carrier captive as the top critical move', () => {
    const agg = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'renters', total_premium: 100000 }),
    ]);
    const moves = generateMoves(agg);
    expect(moves[0].id).toBe('single_carrier_captive');
    expect(moves[0].severity).toBe('critical');
  });

  it('recommends reducing the top carrier when one carrier is 65%', () => {
    const agg = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'renters', total_premium: 65000 }),
      row({ carrier_code: 'progressive', carrier_name: 'Progressive', product_key: 'renters', total_premium: 35000 }),
    ]);
    const moves = generateMoves(agg);
    expect(moves[0].id).toBe('reduce_top_carrier');
    expect(moves[0].severity).toBe('high');
  });

  it('flags a weak bundle ratio as high when home is 5% of auto', () => {
    const agg = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'auto', total_premium: 70000 }),
      row({ carrier_code: 'progressive', carrier_name: 'Progressive', product_key: 'auto', total_premium: 30000 }),
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'ho', total_premium: 5000 }),
    ]);
    const moves = generateMoves(agg);
    const bundle = moves.find(m => m.id === 'bundle_ratio');
    expect(bundle).toBeDefined();
    expect(bundle.severity).toBe('high');
  });

  it('surfaces an umbrella attach move when PUP is ~1% of book', () => {
    const agg = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'auto', total_premium: 99000 }),
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'pup', total_premium: 1000 }),
    ]);
    const moves = generateMoves(agg);
    const pup = moves.find(m => m.id === 'umbrella_attach');
    expect(pup).toBeDefined();
    expect(pup.severity).toBe('medium');
  });

  it('sorts moves critical → high → medium', () => {
    const agg = computeBookAggregates([
      row({ carrier_code: 'allstate', carrier_name: 'Allstate', product_key: 'auto', total_premium: 100000 }),
    ]);
    const moves = generateMoves(agg);
    const order = { critical: 0, high: 1, medium: 2 };
    for (let i = 1; i < moves.length; i++) {
      expect(order[moves[i].severity]).toBeGreaterThanOrEqual(order[moves[i - 1].severity]);
    }
  });
});
