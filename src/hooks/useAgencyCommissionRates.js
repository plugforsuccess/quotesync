// src/hooks/useAgencyCommissionRates.js
// Fetches commission rates from agency_commission_rates + agency_products tables
// and transforms them into the format expected by FunnelDashboardPage's CapacityPlanner.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Mapping from DB tier keys to dashboard tier keys
const TIER_KEY_MAP = {
  preferred: 'preferredBundled',
  bundled: 'bundled',
  monoline: 'monoline',
};

// Mapping from DB product keys to dashboard product line labels
const PRODUCT_LABEL_MAP = {
  auto: 'Standard Auto',
  ho: 'Homeowners / Condo',
  renters: 'Other Personal Lines',
  landlord: 'Other Personal Lines',
  other: 'Other Personal Lines',
};

// Hardcoded defaults (Allstate new business commission schedule)
const DEFAULT_COMMISSION_MATRIX = {
  'Standard Auto':             { preferredBundled: 16, bundled: 11, monoline: 6 },
  'Homeowners / Condo':        { preferredBundled: 20, bundled: 16, monoline: 7 },
  'Other Personal Lines':      { preferredBundled: 17, bundled: 12, monoline: 6 },
};

const DEFAULT_BASE_COMMISSION = 9;

const DEFAULT_POLICY_MIX = [
  { productLine: 'Standard Auto',        tier: 'bundled',          avgPremium: 2200, mixPct: 40 },
  { productLine: 'Standard Auto',        tier: 'monoline',         avgPremium: 1800, mixPct: 20 },
  { productLine: 'Homeowners / Condo',   tier: 'preferredBundled', avgPremium: 2000, mixPct: 15 },
  { productLine: 'Homeowners / Condo',   tier: 'bundled',          avgPremium: 1800, mixPct: 10 },
  { productLine: 'Other Personal Lines', tier: 'monoline',         avgPremium: 1200, mixPct: 15 },
];

/**
 * Fetches agency commission config from the DB and transforms it into
 * the shape FunnelDashboardPage expects.
 *
 * Returns { commissionMatrix, baseCommission, policyMix, isLoaded }
 * Falls back to hardcoded Allstate defaults when no DB data exists.
 */
export function useAgencyCommissionRates(agencyId) {
  const { data: rates } = useQuery({
    queryKey: ['agency_commission_rates', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_commission_rates')
        .select('product_key, tier_key, rate')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });

  const { data: carrierConfig } = useQuery({
    queryKey: ['agency_carrier_config', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_carrier_config')
        .select('commissionable_factor, commission_goal, premium_goal, base_commission_floor')
        .eq('agency_id', agencyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });

  // MT-07: Use per-agency base commission floor from DB when available
  const baseCommission = carrierConfig?.base_commission_floor
    ? Number(carrierConfig.base_commission_floor)
    : DEFAULT_BASE_COMMISSION;

  // If we have DB rates, transform them into the dashboard format
  if (rates && rates.length > 0) {
    const matrix = {};

    for (const row of rates) {
      const productLabel = PRODUCT_LABEL_MAP[row.product_key] || row.product_key;
      const tierKey = TIER_KEY_MAP[row.tier_key] || row.tier_key;

      if (!matrix[productLabel]) {
        matrix[productLabel] = {};
      }
      // Convert decimal rate to whole-number variable commission (rate * 100 - base)
      // The DB stores total rate as decimal. The dashboard uses base + variable.
      // E.g., DB: 0.25 (25%) → base=9, variable=16
      const totalPct = Math.round(row.rate * 100);
      matrix[productLabel][tierKey] = totalPct - baseCommission;
    }

    return {
      commissionMatrix: matrix,
      baseCommission,
      policyMix: DEFAULT_POLICY_MIX,
      isLoaded: true,
    };
  }

  // No agencyId = platform user (or agency still resolving) — defaults are always
  // available, so report isLoaded: true immediately so the dashboard renders.
  return {
    commissionMatrix: DEFAULT_COMMISSION_MATRIX,
    baseCommission,
    policyMix: DEFAULT_POLICY_MIX,
    isLoaded: true,
  };
}
