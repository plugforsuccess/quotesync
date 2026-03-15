import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Allstate commissionable factors (mirrors RevenueProjectionsDashboard)
const COMMISSIONABLE_FACTORS = {
  auto: 0.998, specialty_auto: 0.998, ho: 0.935, condo: 0.959,
  renters: 1.0, landlord: 1.0, pup: 1.0, manufactured: 1.0,
  boat: 1.0, motor_club: 1.0, other: 1.0,
};

const COMMISSION_RATES = {
  auto:           { preferred: 0.25, bundled: 0.20, monoline: 0.15 },
  ho:             { preferred: 0.29, bundled: 0.25, monoline: 0.16 },
  renters:        { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
  other:          { preferred: 0.26, bundled: 0.21, monoline: 0.15 },
};

function calcCommission(premium, product, tier = 'monoline') {
  const rates = COMMISSION_RATES[product] ?? COMMISSION_RATES.other;
  const factor = COMMISSIONABLE_FACTORS[product] ?? 1.0;
  return premium * factor * (rates[tier] ?? rates.monoline);
}

export function useYTDBlended(agencyId) {
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
      if (!data || data.length === 0) return null;

      let totalPremium = 0;
      let totalCommission = 0;
      let totalPolicies = 0;

      for (const e of data) {
        const prem = parseFloat(e.premium) || 0;
        const policies = e.policy_count || 1;
        const commission = calcCommission(prem, e.product, e.tier ?? 'monoline');
        totalPremium    += prem;
        totalCommission += commission;
        totalPolicies   += policies;
      }

      if (totalPolicies === 0 || totalPremium === 0) return null;

      return {
        avgPremiumPerPolicy:    totalPremium    / totalPolicies,
        avgCommissionPerPolicy: totalCommission / totalPolicies,
        blendedCommissionRate:  totalCommission / totalPremium, // as decimal e.g. 0.196
        totalPolicies,
        totalPremium,
        totalCommission,
      };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
