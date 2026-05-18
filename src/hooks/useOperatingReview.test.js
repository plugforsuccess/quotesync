/**
 * Unit tests for computeStreak (Weekly Operating Review streak counter)
 * Run with: npx vitest src/hooks/useOperatingReview.test.js
 */
import { describe, it, expect, vi } from 'vitest';

// useOperatingReview imports the Supabase client, which constructs a real
// client at module load. Stub it so the pure computeStreak export can be
// tested in isolation without env vars.
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { computeStreak } from './useOperatingReview';

describe('computeStreak', () => {
  it('returns 0 with no completions', () => {
    expect(computeStreak([], '2026-05-18')).toBe(0);
  });

  it('counts a single consecutive prior week', () => {
    expect(
      computeStreak([{ review_week: '2026-05-11' }], '2026-05-18')
    ).toBe(1);
  });

  it('counts multiple consecutive prior weeks', () => {
    expect(
      computeStreak(
        [{ review_week: '2026-05-11' }, { review_week: '2026-05-04' }],
        '2026-05-18'
      )
    ).toBe(2);
  });

  it('breaks the streak on a gap', () => {
    expect(
      computeStreak([{ review_week: '2026-05-04' }], '2026-05-18')
    ).toBe(0);
  });
});
