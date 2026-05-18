/**
 * Unit tests for weekUtils (ISO-week, Monday-start helpers)
 * Run with: npx vitest src/lib/weekUtils.test.js
 */
import { describe, it, expect } from 'vitest';
import {
  toMonday,
  toPriorMonday,
  toSunday,
  isInWeek,
  formatWeekLabel,
} from './weekUtils';

describe('toMonday', () => {
  it('returns the same date when given a Monday', () => {
    expect(toMonday('2026-05-18')).toBe('2026-05-18');
  });

  it('snaps a mid-week day back to Monday', () => {
    expect(toMonday('2026-05-20')).toBe('2026-05-18'); // Wed → Mon
  });

  it('treats Sunday as the last day of the prior week', () => {
    expect(toMonday('2026-05-17')).toBe('2026-05-11'); // Sun → prior Mon
  });
});

describe('toPriorMonday', () => {
  it('returns the Monday of the prior week', () => {
    expect(toPriorMonday('2026-05-18')).toBe('2026-05-11');
  });
});

describe('toSunday', () => {
  it('returns the Sunday of the same ISO week', () => {
    expect(toSunday('2026-05-18')).toBe('2026-05-24');
  });
});

describe('isInWeek', () => {
  it('returns true for a date inside the week', () => {
    expect(isInWeek('2026-05-20', '2026-05-18')).toBe(true);
  });

  it('returns false for a date in the next week', () => {
    expect(isInWeek('2026-05-25', '2026-05-18')).toBe(false);
  });
});

describe('formatWeekLabel', () => {
  it('formats a week-start as a human label', () => {
    expect(formatWeekLabel('2026-05-18')).toBe('Week of May 18, 2026');
  });
});
