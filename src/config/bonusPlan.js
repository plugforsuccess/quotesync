// Retention bonus plan helpers — shared between the employee scorecard and the
// principal-facing Staff Performance editor. The live terms live in
// `employee_bonus_plans`; frozen payouts live in `retention_bonus_ledger`.

// What a bonus is paid on. `connected_call` is a verified RingCentral outbound
// connected call (what we measure today). `save` is a retained policy — it needs
// a separate retained-outcome signal, so it's forward-looking.
export const BONUS_UNITS = {
  connected_call: {
    value: 'connected_call',
    verifiedLabel: 'Verified Connected Calls',
    short: 'connected calls',
  },
  save: {
    value: 'save',
    verifiedLabel: 'Verified Saves',
    short: 'saves',
  },
};

export function unitMeta(unit) {
  return BONUS_UNITS[unit] || BONUS_UNITS.connected_call;
}

// Compute the payout from a plan and a measured verified count.
// Returns zeros when there is no enabled plan, so callers can treat the result
// uniformly without branching.
export function computeBonus(plan, verifiedCount) {
  if (!plan || !plan.enabled) return { payableUnits: 0, bonusAmount: 0 };
  const threshold = plan.threshold ?? 0;
  const perUnit = Number(plan.per_unit_amount ?? 0);
  const payableUnits = Math.max(0, (verifiedCount ?? 0) - threshold);
  return { payableUnits, bonusAmount: payableUnits * perUnit };
}
