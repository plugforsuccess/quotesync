// src/lib/productLabels.js
// Human-friendly display labels for carrier product codes. The data layer
// stores short codes ("ho", "auto"); the UI and call scripts should read in
// plain language a customer would recognize — e.g. "ho" → "HOME". Unknown
// codes fall back to their uppercased form, preserving the prior behavior.

const PRODUCT_DISPLAY = {
  ho:          'HOME',
  home:        'HOME',
  homeowner:   'HOME',
  homeowners:  'HOME',
};

export function productLabel(raw) {
  if (!raw) return '';
  const key = String(raw).trim().toLowerCase();
  return PRODUCT_DISPLAY[key] || String(raw).toUpperCase();
}
