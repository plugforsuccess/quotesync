// src/lib/money.js
// Input sanitizer for the free-text premium fields (kept text + inputMode
// "decimal" for mobile keyboards, so the guard lives here, not in the browser).
// Strips currency noise ($, commas, spaces) as the rep types or pastes, keeps
// digits and the first decimal point, and drops everything else — so the value
// is always parseable and "abc" can never satisfy a required premium field.

export function sanitizeMoneyInput(raw) {
  if (raw == null) return '';
  let out = '';
  let seenDot = false;
  for (const ch of String(raw)) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenDot) { out += ch; seenDot = true; }
  }
  return out;
}

// Parse a sanitized (or legacy "$1,200"-style) money string to a number, or
// null when there's no usable amount. Mirrors the .replace(/[$,]/g,'') idiom
// already used at the write sites, so both paths agree on what's valid.
export function parseMoney(value) {
  const n = parseFloat(String(value ?? '').replace(/[$,\s]/g, ''));
  return Number.isNaN(n) ? null : n;
}
