import test from 'node:test';
import assert from 'node:assert/strict';
import { businessMsBetween, isBusinessDate, OPEN_HOUR, CLOSE_HOUR } from '../../src/lib/businessHours.js';

const HOUR = 3600000;
// Eastern wall-clock instants, written with the EDT offset (UTC-4, summer).
// 2026-06-12 is a Friday and 2026-06-15 the following Monday — neither a holiday.
const friday = (h, m = 0) => new Date(`2026-06-12T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`);
const monday = (h, m = 0) => new Date(`2026-06-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-04:00`);

test('office hours match the agency (9am–6pm)', () => {
  assert.equal(OPEN_HOUR, 9);
  assert.equal(CLOSE_HOUR, 18);
});

test('weekends are not business days; weekdays are', () => {
  assert.equal(isBusinessDate(2026, 6, 12), true);  // Friday
  assert.equal(isBusinessDate(2026, 6, 13), false); // Saturday
  assert.equal(isBusinessDate(2026, 6, 14), false); // Sunday
  assert.equal(isBusinessDate(2026, 6, 15), true);  // Monday
});

test('federal/Allstate holidays are excluded (Juneteenth, Fri 2026-06-19)', () => {
  assert.equal(isBusinessDate(2026, 6, 19), false);
});

test('a Friday-afternoon span does NOT burn across the weekend', () => {
  // Fri 3:00pm → Mon 10:00am. Business time = 3h (Fri 3–6pm) + 1h (Mon 9–10am).
  const ms = businessMsBetween(friday(15), monday(10));
  assert.equal(ms, 4 * HOUR);
});

test('overnight gap between two weekdays is excluded', () => {
  // Fri 5:00pm → Mon 9:00am: only Fri 5–6pm counts (Mon starts exactly at open).
  const ms = businessMsBetween(friday(17), monday(9));
  assert.equal(ms, 1 * HOUR);
});

test('time before open and after close does not count', () => {
  // Fri 7:00am (pre-open) → Fri 8:00pm (post-close) = the full 9h window.
  const ms = businessMsBetween(friday(7), friday(20));
  assert.equal(ms, (CLOSE_HOUR - OPEN_HOUR) * HOUR);
});

test('zero or negative spans return 0', () => {
  assert.equal(businessMsBetween(friday(12), friday(12)), 0);
  assert.equal(businessMsBetween(monday(12), friday(12)), 0);
});

test('a full open business day is 9 hours', () => {
  assert.equal(businessMsBetween(friday(9), friday(18)), 9 * HOUR);
});
