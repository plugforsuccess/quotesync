// src/utils/compModelCalculations.js
// Pure functions for all Producer Compensation Model formulas.
// No side effects — safe for useMemo and unit tests.

// ── Core formula exports (spec-aligned signatures) ──────────────────────────

export const blendedAvg = (productMix) =>
  (productMix || []).reduce((sum, p) => sum + (Number(p.mix_pct) || 0) * (Number(p.avg_prem_item) || 0), 0);

export const vcPremium = (n, blended) => n * blended;

export const agencyCommission = (vcPrem, commRate) => vcPrem * commRate;

export const vcBaseComp = (vcPrem, basePct) => vcPrem * basePct;

export const tpBonus = (n, cfg) => {
  const b1 = Number(cfg.tp_band1_threshold) || 0;
  const b2 = Number(cfg.tp_band2_threshold) || 0;
  const a1 = Number(cfg.tp_band1_addon) || 0;
  const a2 = Number(cfg.tp_band2_addon) || 0;
  if (n <= b1) return 0;
  if (n <= b2) return (n - b1) * a1;
  return (b2 - b1) * a1 + (n - b2) * a2;
};

export const fixedCostMonthly = (cfg) =>
  (Number(cfg.base_salary_annual) || 0) / 12 + (Number(cfg.employer_burden_monthly) || 0);

export const totalCostMonthly = (n, cfg, blended) =>
  fixedCostMonthly(cfg) +
  vcBaseComp(vcPremium(n, blended), Number(cfg.vc_base_comp_pct) || 0) +
  tpBonus(n, cfg) +
  (Number(cfg.non_vc_bonus_monthly) || 0);

export const agencyProfitMonthly = (n, cfg, blended) =>
  agencyCommission(vcPremium(n, blended), Number(cfg.vc_commission_rate) || 0) -
  totalCostMonthly(n, cfg, blended);

export const breakEvenItems = (cfg, blended) => {
  for (let n = 1; n <= 100; n++) {
    if (agencyProfitMonthly(n, cfg, blended) >= 0) return n;
  }
  return null;
};

export const scenarioRow = (n, cfg, blended) => {
  const vcPrem     = vcPremium(n, blended);
  const commission = agencyCommission(vcPrem, Number(cfg.vc_commission_rate) || 0);
  const vcComp     = vcBaseComp(vcPrem, Number(cfg.vc_base_comp_pct) || 0);
  const tp         = tpBonus(n, cfg);
  const nonVc      = Number(cfg.non_vc_bonus_monthly) || 0;
  const fixed      = fixedCostMonthly(cfg);
  const totalCost  = fixed + vcComp + tp + nonVc;
  const profitMo   = commission - totalCost;
  return {
    vcPremium:        vcPrem,
    agencyCommission: commission,
    vcBaseComp:       vcComp,
    tpBonus:          tp,
    nonVcBonus:       nonVc,
    totalCost,
    profitMonthly:    profitMo,
    profitAnnual:     profitMo * 12,
    totalAnnualComp:  (Number(cfg.base_salary_annual) || 0) + (vcComp * 12) + (tp * 12) + (nonVc * 12),
  };
};

// ── Convenience aliases (used by existing components) ───────────────────────

export const calcBlendedAvg = blendedAvg;
export const calcVcPremiumMonthly = vcPremium;
export const calcAgencyCommissionMonthly = agencyCommission;
export const calcVcBaseCompMonthly = vcBaseComp;
export const calcTpBonus = tpBonus;

export function calcFixedCostMonthly(baseSalaryAnnual, employerBurdenMonthly) {
  return (Number(baseSalaryAnnual) || 0) / 12 + (Number(employerBurdenMonthly) || 0);
}

export function computeScenario(n, config, productMix) {
  const blended = blendedAvg(productMix);
  const row = scenarioRow(n, config, blended);
  return {
    items: n,
    blendedAvg: blended,
    vcPremiumMonthly: row.vcPremium,
    agencyCommissionMonthly: row.agencyCommission,
    vcBaseCompMonthly: row.vcBaseComp,
    tpBonus: row.tpBonus,
    nonVcBonus: row.nonVcBonus,
    fixedCostMonthly: fixedCostMonthly(config),
    totalCostMonthly: row.totalCost,
    profitMonthly: row.profitMonthly,
    baseSalaryAnnual: Number(config.base_salary_annual) || 0,
    annualComp: row.totalAnnualComp,
    profitAnnual: row.profitAnnual,
  };
}

export function calcBreakEven(config, productMix, maxItems = 200) {
  const blended = blendedAvg(productMix);
  for (let n = 1; n <= maxItems; n++) {
    if (agencyProfitMonthly(n, config, blended) >= 0) return n;
  }
  return null;
}

export function calcMixPctTotal(productMix) {
  if (!productMix || productMix.length === 0) return 0;
  return productMix.reduce((sum, p) => sum + (Number(p.mix_pct) || 0), 0);
}

// ── Constants ───────────────────────────────────────────────────────────────

export const PRESET_SCENARIOS = [
  { name: 'Floor', items: 12 },
  { name: 'Good', items: 15 },
  { name: 'Target', items: 20, isTarget: true },
  { name: 'Accelerator', items: 25 },
  { name: 'Top Performer', items: 30 },
  { name: 'Elite', items: 36 },
  { name: 'Star', items: 40 },
];

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

export const DEFAULT_PRODUCT_MIX = [
  { product_name: 'Auto', mix_pct: 0.53, avg_prem_item: 1800, sort_order: 0 },
  { product_name: 'Home', mix_pct: 0.35, avg_prem_item: 2400, sort_order: 1 },
  { product_name: 'Condo', mix_pct: 0.12, avg_prem_item: 1500, sort_order: 2 },
];
