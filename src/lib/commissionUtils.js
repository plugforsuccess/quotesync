// src/lib/commissionUtils.js
// Shared commission calculation utilities for the Scenario Planner

/**
 * Look up a commission rate from the matrix.
 * Falls back to baseRate if product line or tier is missing.
 */
export function getCommissionRate(productLine, tier, matrix, baseRate) {
  const rates = matrix[productLine];
  if (!rates) return baseRate;
  return rates[tier] ?? baseRate;
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
