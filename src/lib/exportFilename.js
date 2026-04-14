// src/lib/exportFilename.js
// Shared helpers for building standardised export filenames
// (PDF scorecards, attendance XLSX exports, etc.)

/**
 * Builds a standardised agency slug from the agency name.
 * "Wiley-Wilson Agency, Inc." → "WileyWilson"
 */
export function buildAgencySlug(agencyName) {
  return (agencyName || 'Agency')
    .replace(/,?\s*(Inc|LLC|Corp|Co|Ltd)\.?$/i, '') // strip legal suffix
    .replace(/\s+/g, '')                              // remove spaces
    .replace(/[^a-zA-Z0-9]/g, '');                   // strip special chars
}

/**
 * Formats a date as "Apr13" (no space, no comma).
 * Accepts a YYYY-MM-DD string.
 */
export function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .replace(' ', ''); // "Apr 13" → "Apr13"
}

/**
 * Builds a week label "Apr13-Apr17-2026" from a Monday weekStart string.
 */
export function buildWeekLabel(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekStart + 'T00:00:00');
  end.setDate(end.getDate() + 4); // Friday
  return `${fmtDateShort(weekStart)}-${fmtDateShort(end.toLocaleDateString('en-CA'))}-${start.getFullYear()}`;
}
