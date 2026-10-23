// src/pages/components/rate-checks/ruleView.js
// How a routing rule reads on its card: a compact formula ("Dwelling > $4M",
// "Vehicles > 3", "Liability ≥ $300k") and the money formatting the editor uses.
// Pure functions, so the card and the editor's live preview agree.

const SHORT_FIELD = {
  dwelling: 'Dwelling', home_liability: 'Liability', personal_property: 'Personal property',
  bi_per_person: 'BI per person', bi_per_accident: 'BI per accident', pd: 'Property damage', um_uim: 'UM',
  vehicle_count: 'Vehicles', driver_count: 'Drivers', annual_premium: 'Premium', term_months: 'Term (months)',
  carrier: 'Carrier', policy_type: 'Policy type', zip: 'ZIP', housing_situation: 'Housing',
};
const SYMBOL = { gt: '>', gte: '≥', lt: '<', lte: '≤', eq: '=', neq: '≠', in: 'is one of', not_in: 'is not one of', starts_with: 'starts with' };

/** 4000000 → "$4M", 300000 → "$300k", 1500000 → "$1.5M", 500 → "$500". */
export function shortMoney(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  const trim = (x) => String(Number(x.toFixed(1)));
  if (v >= 1e6) return `$${trim(v / 1e6)}M`;
  if (v >= 1e3) return `$${trim(v / 1e3)}k`;
  return `$${v}`;
}

/** "1500000" → "1,500,000" while typing a money value. */
export const withCommas = (digits) => (digits ? Number(digits).toLocaleString('en-US') : '');

/** The rule's condition as a short formula. kind: 'money' | 'number' | 'text'. */
export function ruleFormula(rule, kind) {
  const field = SHORT_FIELD[rule.field] || rule.field;
  if (rule.op === 'missing') return `${field} not on the page`;
  const value = kind === 'money' ? shortMoney(rule.value_num)
    : kind === 'number' ? String(rule.value_num ?? '')
    : String(rule.value_text || '');
  return `${field} ${SYMBOL[rule.op] || rule.op} ${value}`.trim();
}
