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

// Auto policies bill on a 6-month term at Allstate; other personal lines (home,
// renters, umbrella) are annual. Used to label premium fields by the term the
// policy is actually billed on, so a 6-month auto premium isn't mislabeled
// "annual". Unknown products default to annual (the common case for non-auto).
export function isSixMonthTerm(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return key === 'auto' || key.includes('auto');
}

export function premiumTermLabel(raw) {
  return isSixMonthTerm(raw) ? '6-mo term' : 'annual';
}
