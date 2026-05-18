// src/lib/bookPlaybook.js
// Pure rule engine for the Multi-Carrier Playbook. Generates prioritized
// diversification moves from book composition aggregates. No React — testable
// in isolation. Imported by both BookPlaybookTab and the pitch PDF button.

// Carriers in 'standard' group (matches the seeded carriers table).
export const STANDARD_CARRIERS = new Set([
  'allstate', 'progressive', 'state_farm', 'geico', 'liberty_mutual',
  'farmers', 'nationwide', 'travelers', 'usaa', 'safeco',
  'hartford', 'american_family',
]);

export function generateMoves(aggregates) {
  const { byCarrier, byProduct, byCarrierProduct, totalPremium } = aggregates;
  if (totalPremium === 0) return [];

  const moves = [];
  const topCarrier = byCarrier[0];
  const topProduct = byProduct[0];

  // Rule 1: Single-carrier captive (≥95% in one carrier)
  if (byCarrier.length === 1 || (topCarrier && topCarrier.premiumShare >= 95)) {
    moves.push({
      id: 'single_carrier_captive',
      severity: 'critical',
      title: `Add a second carrier appointment`,
      description: `You are ${topCarrier.premiumShare.toFixed(0)}% concentrated in ${topCarrier.carrier_name}. A single comp cut, non-renewal, or appointment termination puts ${topCarrier.premiumShare.toFixed(0)}% of your revenue at immediate risk.`,
      evidence: `Top carrier holds ${topCarrier.premiumShare.toFixed(1)}% of total premium. Industry guidance for owned-book agencies is no single carrier above 50%.`,
      nextStep: `Start with a non-captive MGA appointment (e.g., for specialty risks ${topCarrier.carrier_name} likely doesn't write — manufactured homes, RVs, motorcycles, sub-prime auto).`,
    });
  } else if (topCarrier && topCarrier.premiumShare >= 60) {
    // Rule 2: Carrier above 60% but not alone
    const otherCarriers = byCarrier.slice(1);
    const next = otherCarriers[0];
    moves.push({
      id: 'reduce_top_carrier',
      severity: 'high',
      title: `Reduce ${topCarrier.carrier_name} dependence below 50%`,
      description: `${topCarrier.carrier_name} is ${topCarrier.premiumShare.toFixed(0)}% of your book. Direct new business mix toward ${next?.carrier_name ?? 'another appointed carrier'} over the next 12–24 months.`,
      evidence: `${topCarrier.carrier_name} pullback or comp change would directly impact ${topCarrier.premiumShare.toFixed(0)}% of revenue.`,
      nextStep: `Set a quarterly target: ${topCarrier.carrier_name} new business share ≤ ${Math.max(40, Math.round(topCarrier.premiumShare) - 10)}% by next quarter.`,
    });
  }

  // Rule 3: Standard auto monoline risk
  if (topProduct?.product_key === 'auto' && topProduct.premiumShare >= 50) {
    // Compute auto-to-home ratio from snapshot
    const autoPremium = topProduct.premium;
    const homePremium = (byProduct.find(p => p.product_key === 'ho')?.premium ?? 0) +
                        (byProduct.find(p => p.product_key === 'condo')?.premium ?? 0);
    const bundleRatio = autoPremium > 0 ? (homePremium / autoPremium) : 0;
    moves.push({
      id: 'bundle_ratio',
      severity: bundleRatio < 0.4 ? 'high' : 'medium',
      title: 'Improve auto-to-home bundle ratio',
      description: `Your auto premium is ${topProduct.premiumShare.toFixed(0)}% of book. Home/condo premium is ${(bundleRatio * 100).toFixed(0)}% of auto. Every auto-only customer should be quoted home/renters at renewal.`,
      evidence: `Bundled accounts retain 2–3× longer and absorb comp cuts better. Industry benchmark: home premium ≥ 50% of auto premium.`,
      nextStep: `Pull the list of auto-only customers and assign top 100 to your service team for cross-sell quotes this quarter.`,
    });
  }

  // Rule 4: Underrepresented umbrella product
  const pupShare = byProduct.find(p => p.product_key === 'pup')?.premiumShare ?? 0;
  if (totalPremium > 0 && pupShare < 2) {
    moves.push({
      id: 'umbrella_attach',
      severity: 'medium',
      title: 'Increase personal umbrella attach rate',
      description: `Umbrella is ${pupShare.toFixed(1)}% of book. Target customers with ≥$500K HO coverage or multiple vehicles for $1M PUP attach.`,
      evidence: `PUP commissions are 12–18%, customers attach for under $300/yr, and umbrella retention is the strongest in P&C.`,
      nextStep: `Run an attach-rate audit: any auto+home household without a PUP. Target top 50 by household premium.`,
    });
  }

  // Rule 5: No specialty / non-standard carrier in top 3
  const top3 = byCarrier.slice(0, 3);
  const allStandard = top3.length > 0 && top3.every(c => STANDARD_CARRIERS.has(c.carrier_code));
  if (allStandard) {
    moves.push({
      id: 'non_standard_carrier',
      severity: 'medium',
      title: 'Add a non-standard auto appointment',
      description: `All your appointed carriers are standard. A non-standard carrier (Bristol West, Dairyland, The General) catches the risks your current carriers decline — drivers with MVR issues, SR-22 needs, or recent gaps.`,
      evidence: `Standard-only agencies turn away 15–25% of inbound auto traffic for risk reasons. A non-standard market converts a portion of that turnaway.`,
      nextStep: `Quote the next 10 turnaways through a non-standard market. If 3+ bind, the appointment is justified.`,
    });
  }

  // Rule 6: Heavy HO concentration in one state
  const hoTotal = byProduct.find(p => p.product_key === 'ho')?.premium ?? 0;
  if (hoTotal > 0 && totalPremium > 0 && (hoTotal / totalPremium) >= 0.30) {
    const hoRows = byCarrierProduct.filter(r => r.product_key === 'ho');
    const states = new Set(hoRows.map(r => r.state_code));
    if (states.size === 1) {
      const state = Array.from(states)[0];
      moves.push({
        id: 'ho_cat_exposure',
        severity: 'high',
        title: `Diversify HO catastrophe exposure outside ${state}`,
        description: `Your HO premium is ${((hoTotal / totalPremium) * 100).toFixed(0)}% of book and 100% in ${state}. A single CAT event in ${state} can produce non-renewal waves and rate spikes that compress your entire HO line at once.`,
        evidence: `Florida 2022, Texas freeze 2021, California fire seasons — concentrated single-state HO books absorb the full shock of regional CAT.`,
        nextStep: `Consider an out-of-state HO market via an MGA. Even 10% of HO book outside ${state} reduces single-event variance materially.`,
      });
    }
  }

  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2 };
  moves.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return moves;
}
