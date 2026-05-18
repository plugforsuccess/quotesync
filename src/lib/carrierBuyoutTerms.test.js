/**
 * Unit tests for carrier buyout terms reference data.
 * Run with: npx vitest src/lib/carrierBuyoutTerms.test.js
 */
import { describe, it, expect } from 'vitest';
import {
  CARRIER_BUYOUT_TERMS,
  getBuyoutTerms,
  estimateBookValue,
} from './carrierBuyoutTerms';

describe('carrierBuyoutTerms', () => {
  it('exports the terms map and helpers', () => {
    expect(CARRIER_BUYOUT_TERMS).toBeTypeOf('object');
    expect(getBuyoutTerms).toBeTypeOf('function');
    expect(estimateBookValue).toBeTypeOf('function');
  });

  it('returns Allstate TPP with typical 1.5×', () => {
    const t = getBuyoutTerms('allstate');
    expect(t.tppMultiplierTypical).toBe(1.5);
    expect(t.hasNonCompete).toBe(true);
  });

  it('returns Progressive as independent-owned (no non-compete, 2.5× typical)', () => {
    const t = getBuyoutTerms('progressive');
    expect(t.hasNonCompete).toBe(false);
    expect(t.tppMultiplierTypical).toBe(2.5);
  });

  it('falls back to "other" for an unknown carrier (no undefined)', () => {
    const t = getBuyoutTerms('unknown_carrier');
    expect(t).toBeDefined();
    expect(t).toEqual(CARRIER_BUYOUT_TERMS.other);
  });

  it('computes book value for each variant', () => {
    expect(estimateBookValue(100000, 'allstate', 'typical')).toBe(150000);
    expect(estimateBookValue(100000, 'allstate', 'min')).toBe(50000);
    expect(estimateBookValue(100000, 'allstate', 'max')).toBe(200000);
  });

  it('defaults to typical variant when omitted', () => {
    expect(estimateBookValue(100000, 'allstate')).toBe(150000);
  });
});
