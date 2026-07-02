// src/lib/names.js
// Carrier exports arrive in screaming caps ("JONATHAN BLACKSHEAR"). Title-case
// them for display. Mixed-case names are left untouched so we don't mangle
// already-correct names like "McDonald" or "DeLuca".
export function titleCaseName(name) {
  if (!name) return name;
  if (name !== name.toUpperCase()) return name; // already has lowercase — leave it
  return name
    .toLowerCase()
    .replace(/(^|[\s'’.-])([a-z])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

// A name that's safe to show. Blanks, whitespace, and stringified nulls
// ("undefined"/"null" that leak in from bad joins or carrier exports — the
// latter title-cases to a stray "Undefined") collapse to '' so callers can fall
// back to a placeholder instead of rendering the junk as if it were a customer.
export function displayName(name) {
  const s = (name ?? '').toString().trim();
  if (!s || /^(undefined|null)$/i.test(s)) return '';
  return titleCaseName(s);
}
