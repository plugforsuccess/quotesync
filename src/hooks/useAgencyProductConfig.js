// src/hooks/useAgencyProductConfig.js
// Fetches all product configuration from agency_products and agency_carrier_config.
// Replaces all hardcoded product constant maps across the app.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Fallback values used before data loads or if agency has no products configured.
// These match the current Georgia/Allstate 2026 defaults so existing behavior
// is preserved during the loading state.
const FALLBACK_CONFIG = {
  portfolioPoints:        { auto: 10, ho: 20, condo: 0, renters: 5, landlord: 20, specialty_auto: 5, pup: 0, manufactured: 5, boat: 5, motor_club: 0, other: 0 },
  commissionableFactors:  { auto: 0.998, specialty_auto: 0.998, ho: 0.935, condo: 0.959, renters: 1.0, landlord: 1.0, pup: 1.0, manufactured: 1.0, boat: 1.0, motor_club: 1.0, other: 1.0 },
  nbRates:                { auto: { preferred: 0.25, bundled: 0.20, monoline: 0.15 }, ho: { preferred: 0.29, bundled: 0.25, monoline: 0.16 } },
  renewalRates:           { auto: { bundled: 0.06, monoline: 0.04 }, ho: { bundled: 0.09, monoline: 0.07 } },
  vcEligibleKeys:         ['auto', 'specialty_auto', 'ho', 'renters', 'landlord', 'boat', 'manufactured'],
  vcBaselineTarget:       53,
  allProductKeys:         ['auto', 'ho', 'condo', 'renters', 'landlord', 'specialty_auto', 'pup', 'manufactured', 'boat', 'motor_club', 'other'],
};

async function fetchProductConfig(agencyId) {
  const [productsResult, carrierResult, catResult] = await Promise.all([
    supabase
      .from('agency_products')
      .select(`
        product_key, label, is_vc_eligible, points_per_item, is_active, sort_order,
        commissionable_factor,
        nb_rate_preferred, nb_rate_bundled, nb_rate_monoline,
        renewal_rate_bundled, renewal_rate_monoline
      `)
      .eq('agency_id', agencyId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('agency_carrier_config')
      .select('vc_baseline_target, vc_program_label')
      .eq('agency_id', agencyId)
      .single(),
    // Fetch agency's state for CAT factor lookup
    supabase
      .from('agencies')
      .select('policy_state')
      .eq('id', agencyId)
      .single(),
  ]);

  if (productsResult.error) throw productsResult.error;

  const products = productsResult.data || [];
  const carrier  = carrierResult.data;

  // Fetch CAT factors for this agency's state
  const policyState = catResult.data?.policy_state;
  let catFactors = {};

  if (policyState) {
    const { data: cats } = await supabase
      .from('cat_reinsurance_factors')
      .select('product_key, factor')
      .eq('policy_state', policyState)
      .eq('effective_date', '2026-01-01')
      .eq('carrier', 'allstate');

    if (cats) {
      for (const row of cats) {
        catFactors[row.product_key] = parseFloat(row.factor);
      }
    }
  }

  // Build derived maps from DB rows
  const portfolioPoints       = {};
  const commissionableFactors = {};
  const nbRates               = {};
  const renewalRates          = {};
  const vcEligibleKeys        = [];
  const allProductKeys        = [];
  const productLabels         = {};

  for (const p of products) {
    const k = p.product_key;
    allProductKeys.push(k);
    productLabels[k]         = p.label;
    portfolioPoints[k]       = p.points_per_item ?? 0;
    // CAT table takes precedence; agency_products.commissionable_factor is a manual override
    commissionableFactors[k] = catFactors[k]
      ?? parseFloat(p.commissionable_factor)
      ?? 1.0;

    if (p.is_vc_eligible) vcEligibleKeys.push(k);

    if (p.nb_rate_preferred != null || p.nb_rate_bundled != null || p.nb_rate_monoline != null) {
      nbRates[k] = {
        preferred: parseFloat(p.nb_rate_preferred) || 0,
        bundled:   parseFloat(p.nb_rate_bundled)   || 0,
        monoline:  parseFloat(p.nb_rate_monoline)  || 0,
      };
    }

    if (p.renewal_rate_bundled != null || p.renewal_rate_monoline != null) {
      renewalRates[k] = {
        bundled:  parseFloat(p.renewal_rate_bundled)  || 0,
        monoline: parseFloat(p.renewal_rate_monoline) || 0,
      };
    }
  }

  return {
    portfolioPoints,
    commissionableFactors,
    nbRates,
    renewalRates,
    vcEligibleKeys,
    vcBaselineTarget: carrier?.vc_baseline_target ?? 53,
    vcProgramLabel:   carrier?.vc_program_label   ?? 'VC Baseline',
    allProductKeys,
    productLabels,
    // Convenience: non-VC keys = all active keys that are not VC eligible
    nonVcEligibleKeys: allProductKeys.filter(k => !vcEligibleKeys.includes(k)),
    // Convenience: "core" keys = auto + primary property (first VC-eligible property product)
    // This replaces the hardcoded CORE_KEYS = ["auto", "ho"]
    coreKeys: ['auto', ...vcEligibleKeys.filter(k => ['ho', 'condo', 'renters'].includes(k)).slice(0, 1)],
  };
}

export function useAgencyProductConfig(agencyId) {
  const { data, isLoading, error } = useQuery({
    queryKey:  ['agency_product_config', agencyId],
    queryFn:   () => fetchProductConfig(agencyId),
    enabled:   !!agencyId,
    staleTime: 10 * 60 * 1000,  // 10 minutes — rarely changes
  });

  // Return fallback synchronously during load so consumers don't get empty maps
  return {
    config:    data ?? FALLBACK_CONFIG,
    isLoading,
    error,
  };
}
