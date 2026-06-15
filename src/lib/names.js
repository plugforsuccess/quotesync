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
