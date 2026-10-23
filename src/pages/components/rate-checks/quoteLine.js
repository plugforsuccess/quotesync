// src/pages/components/rate-checks/quoteLine.js
// What to quote for a household, in the words a producer uses:
// "Quote Allstate Home + Auto + PUP". Built from the dec pages they sent plus
// what they told us about where they live (an owner gets Home even if they only
// sent auto; a renter gets Renters). PUP when they sent an umbrella or the rules
// say the household qualifies for one.

const PROPERTY = [['home', 'Home'], ['condo', 'Condo'], ['renters', 'Renters']];
const QUOTE_DECISIONS = new Set(['quote_allstate', 'quote_allstate_umbrella']);

/** ['Home', 'Auto', 'PUP'] for the household's policies (rate_checks rows). */
export function quoteProducts(policies = [], decision = null) {
  const types = new Set(policies.map(p => p.policy_type).filter(Boolean));
  const housing = policies.map(p => p.housing_situation).find(Boolean);
  const out = [];
  const property = PROPERTY.filter(([t]) => types.has(t)).map(([, label]) => label);
  if (property.length) out.push(...property);
  else if (housing === 'own') out.push('Home');
  else if (housing === 'rent') out.push('Renters');
  if (types.has('auto')) out.push('Auto');
  if (types.has('umbrella') || decision === 'quote_allstate_umbrella') out.push('PUP');
  return out;
}

/** "Quote Allstate Home + Auto + PUP", or null when the decision isn't a straight Allstate quote. */
export function quoteHeadline(policies, decision) {
  if (!QUOTE_DECISIONS.has(decision)) return null;
  const products = quoteProducts(policies, decision);
  return `Quote Allstate ${products.length ? products.join(' + ') : 'P&C'}`;
}
