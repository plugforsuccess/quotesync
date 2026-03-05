import { DateTime } from 'luxon';

/**
 * Parse a timezone-naive datetime string as a specific business timezone
 * and return a UTC Date object.
 *
 * RingCentral exports timestamps in MM/DD/YYYY h:mm:ss AM/PM format
 * without timezone info — they represent the account's local time
 * (America/New_York). This function uses Luxon for deterministic
 * timezone-aware parsing that handles DST boundaries correctly.
 *
 * @param {string} ts  - Raw timestamp string from the XLSX export
 * @param {string} timeZone - IANA timezone (default: America/New_York)
 * @returns {Date} UTC Date object, or Invalid Date on failure
 */
export function parseAsBusinessTz(ts, timeZone = 'America/New_York') {
  const s = String(ts || '')
    .replace(/\u00A0/g, ' ')  // NBSP from Excel exports
    .trim();

  if (!s) return new Date(NaN);

  const dt = DateTime.fromFormat(s, 'M/d/yyyy h:mm:ss a', { zone: timeZone });

  return dt.isValid ? dt.toUTC().toJSDate() : new Date(NaN);
}
