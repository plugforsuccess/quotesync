// src/lib/weekUtils.js
// Shared utilities for ISO-week (Monday-start) calculations.

/**
 * Returns the Monday of the ISO week containing `date`, as a 'YYYY-MM-DD' string.
 * Sunday is treated as the last day of the previous week.
 *
 * @param {Date|string} date  Date object or 'YYYY-MM-DD' string
 * @returns {string} 'YYYY-MM-DD' (local date, en-CA format)
 */
export function toMonday(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toLocaleDateString('en-CA');
}

/**
 * Returns the Monday of the week BEFORE the week containing `date`.
 * @param {Date|string} date
 * @returns {string}
 */
export function toPriorMonday(date) {
  const thisMonday = new Date(toMonday(date) + 'T00:00:00');
  thisMonday.setDate(thisMonday.getDate() - 7);
  return thisMonday.toLocaleDateString('en-CA');
}

/**
 * Returns Sunday of the same ISO week (the day before the next Monday).
 * @param {Date|string} date
 * @returns {string}
 */
export function toSunday(date) {
  const monday = new Date(toMonday(date) + 'T00:00:00');
  monday.setDate(monday.getDate() + 6);
  return monday.toLocaleDateString('en-CA');
}

/**
 * Returns true if the given ISO date string falls between the week's
 * Monday and Sunday (inclusive).
 */
export function isInWeek(isoDate, weekStart) {
  const start = weekStart;
  const end = toSunday(weekStart);
  return isoDate >= start && isoDate <= end;
}

/**
 * Format a week as a human label, e.g., "Week of May 12, 2026"
 */
export function formatWeekLabel(weekStart) {
  return `Week of ${new Date(weekStart + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })}`;
}
