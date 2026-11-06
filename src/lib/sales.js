// src/lib/sales.js
// Shared words and rules for quotes and binds (Producer Command Center).
export const PRODUCTS = [
  ['auto', 'Auto'], ['home', 'Home'], ['condo', 'Condo'], ['renters', 'Renters'],
  ['landlord', 'Landlord'], ['umbrella', 'Umbrella'], ['motorcycle', 'Motorcycle'], ['boat', 'Boat'],
];
export const LABEL = Object.fromEntries(PRODUCTS);
export const BUNDLE = { preferred_bundle: 'Preferred bundle', bundle: 'Bundle', mono_line: 'Mono line' };
export const LOST = [['price', 'Price', 'Our quote was higher'], ['no_response', 'No response', 'Went dark after the quote'], ['not_eligible', 'Not eligible', 'Underwriting: couldn’t write it']];

// Same rule as the database: Auto + Home or Condo = preferred bundle; auto + any other line = bundle.
export function bundleTypeFor(products) {
  const p = new Set(products);
  if (p.has('auto') && (p.has('home') || p.has('condo'))) return 'preferred_bundle';
  if (p.has('auto') && p.size > 1) return 'bundle';
  return 'mono_line';
}
export const defaultTerm = (product) => (product === 'auto' || product === 'motorcycle' ? 6 : 12);
export const money = (n) => (n == null ? '—' : `$${Math.round(Number(n)).toLocaleString('en-US')}`);

/**
 * How many quotes a set of sales_quotes rows counts for: one per policy quoted.
 * A household's auto + home is ONE record (a line per policy) but counts as 2 quotes.
 * Use this for every quote count (scorecard, floors, reports), never the row count.
 */
export function quoteCount(quotes) {
  return (quotes || []).reduce((n, q) => {
    const lines = Array.isArray(q.lines) ? q.lines.length : 0;
    return n + (lines || (Array.isArray(q.products) ? q.products.length : 0) || 1);
  }, 0);
}
