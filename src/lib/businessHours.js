// src/lib/businessHours.js
// Business-time math for the Service Batch SLA and completion-pace metrics.
//
// The agency runs Mon–Fri, 9am–6pm Eastern (matching the
// `bland-availability-check` edge function's `isEasternBusinessHours`, which
// gates outbound voice to weekdays 9 ≤ hour < 18 America/New_York), and observes
// the same federal/Allstate holidays as the time-&-attendance code
// (`getFederalHolidays`). The SLA clock should only burn during those open
// hours — a task logged Friday afternoon must not march "overdue" across a
// closed weekend, which both inflates the Overdue count and skews the
// median-time-to-done curve. Every helper here measures *business* time so the
// timer freezes whenever the office is shut.

import { getFederalHolidays } from './federalHolidays.js';

export const BUSINESS_TZ = 'America/New_York';
export const OPEN_HOUR = 9;   // 9:00am Eastern
export const CLOSE_HOUR = 18; // 6:00pm Eastern
const MS_PER_BUSINESS_DAY = (CLOSE_HOUR - OPEN_HOUR) * 3600000; // 9h window

const pad = n => String(n).padStart(2, '0');

// Eastern calendar Y/M/D for an instant (so "what day is it, locally" is correct
// regardless of the viewer's own timezone). Uses Intl, no external tz library.
function easternYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  return { y: +get('year'), m: +get('month'), d: +get('day') };
}

// Minutes that BUSINESS_TZ is offset from UTC at a given instant (DST-aware).
function easternOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ, hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(date);
  const get = t => parts.find(p => p.type === t)?.value;
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // Intl can emit hour '24' at midnight
  const asUTC = Date.UTC(+get('year'), +get('month') - 1, +get('day'), hour, +get('minute'), +get('second'));
  return (asUTC - date.getTime()) / 60000;
}

// The UTC instant (ms) of `hour:00` Eastern on a given Eastern calendar date,
// resolving the local offset (incl. DST) so the wall time is exact.
function easternWallInstant(y, m, d, hour) {
  const naiveUTC = Date.UTC(y, m - 1, d, hour, 0, 0);
  const off = easternOffsetMinutes(new Date(naiveUTC));
  let instant = naiveUTC - off * 60000;
  // One refinement pass for the rare DST-boundary case where the offset at the
  // naive guess differs from the offset at the resolved instant.
  const off2 = easternOffsetMinutes(new Date(instant));
  if (off2 !== off) instant = naiveUTC - off2 * 60000;
  return instant;
}

// Is this Eastern calendar date an open business day (Mon–Fri, not a holiday)?
export function isBusinessDate(y, m, d) {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun … 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !getFederalHolidays(y).has(`${y}-${pad(m)}-${pad(d)}`);
}

function nextDate(y, m, d) {
  const nd = new Date(Date.UTC(y, m - 1, d));
  nd.setUTCDate(nd.getUTCDate() + 1);
  return { y: nd.getUTCFullYear(), m: nd.getUTCMonth() + 1, d: nd.getUTCDate() };
}

// Milliseconds of business time (open hours on business days) between two
// instants. Returns 0 when end ≤ start. Accepts Date | ISO string | epoch ms.
export function businessMsBetween(start, end) {
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  if (!(endMs > startMs)) return 0;

  let total = 0;
  let { y, m, d } = easternYmd(new Date(startMs));
  // Cap the walk well past any realistic span (≈2 years) so a stale timestamp
  // can never spin. Each iteration is one Eastern calendar day.
  for (let i = 0; i < 800; i++) {
    const open = easternWallInstant(y, m, d, OPEN_HOUR);
    if (open >= endMs) break; // this day's window starts after the end → done
    if (isBusinessDate(y, m, d)) {
      const close = easternWallInstant(y, m, d, CLOSE_HOUR);
      const lo = Math.max(open, startMs);
      const hi = Math.min(close, endMs);
      if (hi > lo) total += hi - lo;
    }
    ({ y, m, d } = nextDate(y, m, d));
  }
  return total;
}

// Convenience: full open-hours in one business day (9h), e.g. for budget math.
export { MS_PER_BUSINESS_DAY };
