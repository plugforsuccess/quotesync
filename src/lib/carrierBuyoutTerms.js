// src/lib/carrierBuyoutTerms.js
// Carrier termination/buyout payment provisions.
// Multipliers are applied to trailing 12-month gross commission.
//
// Sources:
//   - Allstate: Allstate Exclusive Agency Independent Contractor Agreement, TPP
//   - State Farm: Agency Agreement AA4 (public summaries)
//   - Other carriers: Industry reference points; validate per-agency.
//
// Values below are TYPICAL within published ranges. Real outcomes depend on
// agency performance, agreement vintage, and negotiation. Principals can
// override per-row in the scenario editor.

/**
 * @typedef {Object} CarrierBuyoutTerms
 * @property {number} tppMultiplierMin
 * @property {number} tppMultiplierTypical
 * @property {number} tppMultiplierMax
 * @property {string} structureNote
 * @property {boolean} hasNonCompete
 * @property {number} nonCompeteYears
 * @property {string} sourceNote
 */

function INDEPENDENT_OWNED_TERMS(displayName) {
  return {
    tppMultiplierMin:     1.5,
    tppMultiplierTypical: 2.5,
    tppMultiplierMax:     4.0,
    structureNote:        `${displayName} appointments: agency typically owns the book outright. Sellable on open market for 1.5–4× trailing commission, varies by carrier mix, retention, and buyer.`,
    hasNonCompete:        false,
    nonCompeteYears:      0,
    sourceNote:           'Industry reference points for independent / multi-carrier appointments. Validate per-carrier agreement.',
  };
}

/** @type {Record<string, CarrierBuyoutTerms>} */
export const CARRIER_BUYOUT_TERMS = {
  allstate: {
    tppMultiplierMin:     0.5,
    tppMultiplierTypical: 1.5,
    tppMultiplierMax:     2.0,
    structureNote:        'Termination Payment Provision (TPP). Lump-sum based on trailing 12mo commission, multiplier set by Allstate at termination. Subject to non-compete.',
    hasNonCompete:        true,
    nonCompeteYears:      1,
    sourceNote:           'Allstate Exclusive Agency Independent Contractor Agreement, TPP section.',
  },
  state_farm: {
    tppMultiplierMin:     1.0,
    tppMultiplierTypical: 1.5,
    tppMultiplierMax:     2.0,
    structureNote:        'Termination Compensation Plan. Multi-year payout (typically 5 years) based on trailing commission. Non-compete enforced.',
    hasNonCompete:        true,
    nonCompeteYears:      1,
    sourceNote:           'State Farm Agency Agreement AA4 termination provisions (public summaries).',
  },
  farmers: {
    tppMultiplierMin:     1.0,
    tppMultiplierTypical: 2.0,
    tppMultiplierMax:     3.0,
    structureNote:        'Contract Value payment. Typically 2× trailing service commissions, paid in installments.',
    hasNonCompete:        true,
    nonCompeteYears:      1,
    sourceNote:           'Farmers Agent Appointment Agreement, contract value provision.',
  },
  // Independent / multi-carrier networks — agency owns the book outright.
  progressive:      INDEPENDENT_OWNED_TERMS('Progressive'),
  geico:            INDEPENDENT_OWNED_TERMS('GEICO (direct writer — agents do not own renewals)'),
  liberty_mutual:   INDEPENDENT_OWNED_TERMS('Liberty Mutual'),
  nationwide:       INDEPENDENT_OWNED_TERMS('Nationwide'),
  travelers:        INDEPENDENT_OWNED_TERMS('Travelers'),
  usaa:             INDEPENDENT_OWNED_TERMS('USAA (direct writer — agents do not own renewals)'),
  safeco:           INDEPENDENT_OWNED_TERMS('Safeco'),
  hartford:         INDEPENDENT_OWNED_TERMS('The Hartford'),
  american_family:  INDEPENDENT_OWNED_TERMS('American Family'),
  national_general: INDEPENDENT_OWNED_TERMS('National General'),
  bristol_west:     INDEPENDENT_OWNED_TERMS('Bristol West'),
  dairyland:        INDEPENDENT_OWNED_TERMS('Dairyland'),
  the_general:      INDEPENDENT_OWNED_TERMS('The General'),
  foremost:         INDEPENDENT_OWNED_TERMS('Foremost'),
  hippo:            INDEPENDENT_OWNED_TERMS('Hippo'),
  lemonade:         INDEPENDENT_OWNED_TERMS('Lemonade'),
  other:            INDEPENDENT_OWNED_TERMS('Other carrier'),
};

/**
 * Look up buyout terms. Returns `other` fallback if unknown.
 * @param {string} carrierCode
 * @returns {CarrierBuyoutTerms}
 */
export function getBuyoutTerms(carrierCode) {
  return CARRIER_BUYOUT_TERMS[carrierCode] ?? CARRIER_BUYOUT_TERMS.other;
}

/**
 * Compute estimated book value for trailing commission + carrier.
 * @param {number} trailingAnnualCommission
 * @param {string} carrierCode
 * @param {'min'|'typical'|'max'} variant
 * @returns {number}
 */
export function estimateBookValue(trailingAnnualCommission, carrierCode, variant = 'typical') {
  const terms = getBuyoutTerms(carrierCode);
  const m =
    variant === 'min' ? terms.tppMultiplierMin :
    variant === 'max' ? terms.tppMultiplierMax :
    terms.tppMultiplierTypical;
  return trailingAnnualCommission * m;
}
