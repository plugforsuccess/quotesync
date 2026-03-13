// src/utils/compModelCalculations.js
// Pure functions for all Producer Compensation Model formulas.
// No side effects — safe for useMemo and unit tests.

/**
 * Blended average VC premium per item from the product mix.
 * blended_avg = SUM(product.mix_pct × product.avg_prem_item)
 */
export function calcBlendedAvg(productMix) {
  if (!productMix || productMix.length === 0) return 0;
  return productMix.reduce(
    (sum, p) => sum + (Number(p.mix_pct) || 0) * (Number(p.avg_prem_item) || 0),
    0
  );
}

/**
 * Monthly VC Premium given item count n.
 */
export function calcVcPremiumMonthly(n, blendedAvg) {
  return n * blendedAvg;
}

/**
 * Monthly agency commission on VC premium.
 */
export function calcAgencyCommissionMonthly(vcPremiumMonthly, vcCommissionRate) {
  return vcPremiumMonthly * vcCommissionRate;
}

/**
 * Monthly VC base comp (producer cost).
 */
export function calcVcBaseCompMonthly(vcPremiumMonthly, vcBaseCompPct) {
  return vcPremiumMonthly * vcBaseCompPct;
}

/**
 * Monthly Top Performer bonus (two-band marginal structure).
 */
export function calcTpBonus(n, config) {
  const { tp_band1_threshold, tp_band1_addon, tp_band2_threshold, tp_band2_addon } = config;
  const b1 = Number(tp_band1_threshold) || 0;
  const b2 = Number(tp_band2_threshold) || 0;
  const a1 = Number(tp_band1_addon) || 0;
  const a2 = Number(tp_band2_addon) || 0;

  if (n <= b1) return 0;
  if (n <= b2) return (n - b1) * a1;
  return (b2 - b1) * a1 + (n - b2) * a2;
}

/**
 * Monthly fixed cost to agency.
 */
export function calcFixedCostMonthly(baseSalaryAnnual, employerBurdenMonthly) {
  return (Number(baseSalaryAnnual) || 0) / 12 + (Number(employerBurdenMonthly) || 0);
}

/**
 * Compute full scenario output for a given item count.
 */
export function computeScenario(n, config, productMix) {
  const blendedAvg = calcBlendedAvg(productMix);
  const vcPremiumMonthly = calcVcPremiumMonthly(n, blendedAvg);
  const agencyCommissionMonthly = calcAgencyCommissionMonthly(
    vcPremiumMonthly,
    Number(config.vc_commission_rate) || 0
  );
  const vcBaseCompMonthly = calcVcBaseCompMonthly(
    vcPremiumMonthly,
    Number(config.vc_base_comp_pct) || 0
  );
  const tpBonus = calcTpBonus(n, config);
  const nonVcBonus = Number(config.non_vc_bonus_monthly) || 0;
  const fixedCostMonthly = calcFixedCostMonthly(
    config.base_salary_annual,
    config.employer_burden_monthly
  );
  const totalCostMonthly = fixedCostMonthly + vcBaseCompMonthly + tpBonus + nonVcBonus;
  const profitMonthly = agencyCommissionMonthly - totalCostMonthly;

  const baseSalaryAnnual = Number(config.base_salary_annual) || 0;
  const annualComp = baseSalaryAnnual + (vcBaseCompMonthly * 12) + (tpBonus * 12) + (nonVcBonus * 12);
  const profitAnnual = profitMonthly * 12;

  return {
    items: n,
    blendedAvg,
    vcPremiumMonthly,
    agencyCommissionMonthly,
    vcBaseCompMonthly,
    tpBonus,
    nonVcBonus,
    fixedCostMonthly,
    totalCostMonthly,
    profitMonthly,
    baseSalaryAnnual,
    annualComp,
    profitAnnual,
  };
}

/**
 * Find the break-even item count (smallest n where agency profit >= 0).
 */
export function calcBreakEven(config, productMix, maxItems = 200) {
  for (let n = 1; n <= maxItems; n++) {
    const scenario = computeScenario(n, config, productMix);
    if (scenario.profitMonthly >= 0) return n;
  }
  return null; // no break-even found within range
}

/**
 * Sum of mix_pct across all product mix rows.
 */
export function calcMixPctTotal(productMix) {
  if (!productMix || productMix.length === 0) return 0;
  return productMix.reduce((sum, p) => sum + (Number(p.mix_pct) || 0), 0);
}

/**
 * Preset scenario definitions.
 */
export const PRESET_SCENARIOS = [
  { name: 'Floor', items: 12 },
  { name: 'Good', items: 15 },
  { name: 'Target', items: 20, isTarget: true },
  { name: 'Accelerator', items: 25 },
  { name: 'Top Performer', items: 30 },
  { name: 'Elite', items: 36 },
  { name: 'Star', items: 40 },
];

/**
 * Default config values for new configs.
 */
export const DEFAULT_CONFIG = {
  base_salary_annual: 35000,
  employer_burden_monthly: 279,
  vc_base_comp_pct: 0.05,
  vc_commission_rate: 0.234,
  non_vc_bonus_monthly: 75,
  tp_band1_threshold: 30,
  tp_band1_addon: 25,
  tp_band2_threshold: 36,
  tp_band2_addon: 50,
};

/**
 * Default product mix for new configs.
 */
export const DEFAULT_PRODUCT_MIX = [
  { product_name: 'Auto', mix_pct: 0.53, avg_prem_item: 1800, sort_order: 0 },
  { product_name: 'Home', mix_pct: 0.35, avg_prem_item: 2400, sort_order: 1 },
  { product_name: 'Condo', mix_pct: 0.12, avg_prem_item: 1500, sort_order: 2 },
];
