/**
 * Unit tests for parseAsBusinessTz (Luxon-based RC timestamp parser)
 * Run with: npx vitest src/utils/parseAsBusinessTz.test.js
 */
import { describe, it, expect } from 'vitest';
import { parseAsBusinessTz } from './parseAsBusinessTz';

describe('parseAsBusinessTz', () => {
  // EST (UTC-5) — March 2 is before spring-forward (Mar 8 2026)
  it('parses afternoon PM timestamp in EST', () => {
    const d = parseAsBusinessTz('03/02/2026 5:53:37 PM');
    expect(d.toISOString()).toBe('2026-03-02T22:53:37.000Z'); // 17:53 + 5h
  });

  it('parses morning AM timestamp in EST', () => {
    const d = parseAsBusinessTz('03/02/2026 9:22:50 AM');
    expect(d.toISOString()).toBe('2026-03-02T14:22:50.000Z'); // 9:22 + 5h
  });

  it('parses 12:00:00 AM (midnight) correctly', () => {
    const d = parseAsBusinessTz('03/02/2026 12:00:00 AM');
    expect(d.toISOString()).toBe('2026-03-02T05:00:00.000Z'); // 0:00 + 5h
  });

  it('parses 12:00:00 PM (noon) correctly', () => {
    const d = parseAsBusinessTz('03/02/2026 12:00:00 PM');
    expect(d.toISOString()).toBe('2026-03-02T17:00:00.000Z'); // 12:00 + 5h
  });

  it('parses 1:05:41 PM correctly', () => {
    const d = parseAsBusinessTz('03/02/2026 1:05:41 PM');
    expect(d.toISOString()).toBe('2026-03-02T18:05:41.000Z'); // 13:05 + 5h
  });

  // EDT (UTC-4) — after spring-forward
  it('handles DST (EDT) correctly', () => {
    const d = parseAsBusinessTz('07/04/2026 2:00:00 PM');
    expect(d.toISOString()).toBe('2026-07-04T18:00:00.000Z'); // 14:00 + 4h
  });

  // Spring-forward edge: 2:30 AM doesn't exist in Eastern on Mar 8 2026
  // Luxon resolves this forward — the result should still be a valid Date
  it('handles spring-forward gap gracefully', () => {
    const d = parseAsBusinessTz('03/08/2026 2:30:00 AM');
    expect(d.getTime()).not.toBeNaN();
  });

  // Invalid / empty inputs
  it('returns Invalid Date for empty string', () => {
    expect(parseAsBusinessTz('').getTime()).toBeNaN();
  });

  it('returns Invalid Date for null', () => {
    expect(parseAsBusinessTz(null).getTime()).toBeNaN();
  });

  it('returns Invalid Date for garbage input', () => {
    expect(parseAsBusinessTz('not a date').getTime()).toBeNaN();
  });

  // NBSP handling
  it('handles non-breaking spaces from Excel exports', () => {
    const d = parseAsBusinessTz('03/02/2026\u00A01:05:41\u00A0PM');
    expect(d.toISOString()).toBe('2026-03-02T18:05:41.000Z');
  });
});
