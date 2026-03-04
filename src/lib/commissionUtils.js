// src/lib/commissionUtils.js
// Shared commission calculation utilities for the Scenario Planner

/**
 * Look up a commission rate from the matrix.
 * Falls back to baseRate if product line or tier is missing.
 */
export function getCommissionRate(productLine, tier, matrix, baseRate) {
  const rates = matrix[productLine];
  if (!rates) return baseRate;
  const variable = rates[tier];
  if (variable == null) return baseRate;
  return baseRate + variable;
}

/**
 * Compute blended (premium-weighted) average premium and commission rate
 * from a policy mix array.
 *
 * @returns {{ avgPremium: number, commissionRate: number }}
 */
export function getBlendedValues(policyMix, commissionMatrix, baseCommission) {
  if (!policyMix || policyMix.length === 0) {
    return { avgPremium: 0, commissionRate: 0 };
  }

  const matrix = commissionMatrix || {};
  const base = baseCommission || 9;

  const blendedPremium = policyMix.reduce(
    (sum, r) => sum + (r.mixPct / 100) * r.avgPremium, 0
  );

  const blendedCommission = blendedPremium > 0
    ? policyMix.reduce((sum, r) => {
        const mix = r.mixPct / 100;
        const rate = getCommissionRate(r.productLine, r.tier, matrix, base);
        return sum + (mix * r.avgPremium * rate);
      }, 0) / blendedPremium
    : 0;

  return { avgPremium: blendedPremium, commissionRate: blendedCommission };
}

/**
 * Get the first-year commission multiplier for a product line.
 * Auto (6-month renewal cycle): 2 commission events (new business + first renewal at month 6)
 * Home/OPL (12-month renewal cycle): 1 commission event (new business only; renewal at month 12+ is outside year 1)
 */
const RENEWAL_CYCLE_MONTHS = {
  'Standard Auto': 6,
  'Homeowners / Condo': 12,
  'Other Personal Lines': 12,
};

export function getFirstYearMultiplier(productLine) {
  const cycle = RENEWAL_CYCLE_MONTHS[productLine];
  return cycle && cycle <= 6 ? 2 : 1;
}
