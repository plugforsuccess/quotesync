// src/hooks/useYTDBlended.js

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAgencyProductConfig } from './useAgencyProductConfig';

export function useYTDBlended(agencyId) {
  const { config } = useAgencyProductConfig(agencyId);
  const year = new Date().getFullYear();

  return useQuery({
    queryKey: ['ytd_blended', agencyId, year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_entries')
        .select('premium, product, tier, policy_count')
        .eq('agency_id', agencyId)
        .gte('issued_date', `${year}-01-01`)
        .lte('issued_date', `${year}-12-31`);

      if (error) throw error;
      if (!data?.length) return null;

      let totalPremium = 0, totalCommission = 0, totalPolicies = 0;

      for (const e of data) {
        const prem     = parseFloat(e.premium) || 0;
        const policies = e.policy_count || 1;
        const tier     = e.tier ?? 'monoline';
        const factor   = config.commissionableFactors[e.product] ?? 1.0;
        const rates    = config.nbRates[e.product] ?? config.nbRates['other'] ?? { preferred: 0.26, bundled: 0.21, monoline: 0.15 };
        const rate     = rates[tier] ?? rates.monoline;

        totalPremium    += prem;
        totalCommission += prem * factor * rate;
        totalPolicies   += policies;
      }

      if (!totalPolicies || !totalPremium) return null;

      return {
        avgPremiumPerPolicy:    totalPremium    / totalPolicies,
        avgCommissionPerPolicy: totalCommission / totalPolicies,
        blendedCommissionRate:  totalCommission / totalPremium,
        totalPolicies,
        totalPremium,
        totalCommission,
      };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
