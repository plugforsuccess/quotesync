// src/hooks/useTrailingRevenueStats.js
// Trailing-N-month blended commission rate + per-product breakdown.
// Used by the agency settings page to show implied vs realized rates
// when the principal edits revenue goals.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAgencyProductConfig } from './useAgencyProductConfig';

/**
 * @param {string} agencyId
 * @param {number} months   trailing window in months (default 12)
 */
export function useTrailingRevenueStats(agencyId, months = 12) {
  const { config } = useAgencyProductConfig(agencyId);

  // Compute window inclusive of today, exclusive of the first of the month
  // `months` ago. Using ISO strings keeps the queryKey stable across renders.
  const now    = new Date();
  const endStr = now.toISOString().slice(0, 10);
  const start  = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = start.toISOString().slice(0, 10);

  return useQuery({
    queryKey: ['trailing_revenue_stats', agencyId, startStr, endStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('revenue_entries')
        .select('premium, product, tier, item_count, policy_count')
        .eq('agency_id', agencyId)
        .gte('issued_date', startStr)
        .lte('issued_date', endStr);

      if (error) throw error;
      if (!data?.length) {
        return {
          trailingBlendedRate: null,
          totalPremium:     0,
          totalCommission:  0,
          totalPolicies:    0,
          byProduct:        {},
          hasData:          false,
          months,
          startDate:        startStr,
          endDate:          endStr,
        };
      }

      // Aggregate per product using VC tiered rates — the realistic ceiling
      // the principal will hit when baseline is met.
      const byProduct = {};
      let totalPremium = 0, totalCommission = 0, totalPolicies = 0;

      for (const e of data) {
        const prem     = parseFloat(e.premium) || 0;
        const policies = e.policy_count || 1;
        const tier     = e.tier ?? 'monoline';
        const factor   = config.commissionableFactors[e.product] ?? 1.0;
        const rates    = config.nbRates[e.product]
          ?? config.nbRates.other
          ?? { preferred: 0.26, bundled: 0.21, monoline: 0.15 };
        const rate     = rates[tier] ?? rates.monoline;

        // Motor Club is a flat 25% regardless of tier, mirroring calcCommission
        // in RevenueProjectionsDashboard — keep the two call sites consistent.
        const commission = e.product === 'motor_club'
          ? prem * 0.25
          : prem * factor * rate;

        if (!byProduct[e.product]) {
          byProduct[e.product] = { premium: 0, commission: 0, policies: 0 };
        }
        byProduct[e.product].premium    += prem;
        byProduct[e.product].commission += commission;
        byProduct[e.product].policies   += policies;

        totalPremium    += prem;
        totalCommission += commission;
        totalPolicies   += policies;
      }

      // Derive share + effective rate per product
      for (const k of Object.keys(byProduct)) {
        const row = byProduct[k];
        row.share         = totalPremium    > 0 ? row.premium / totalPremium       : 0;
        row.commissionShare = totalCommission > 0 ? row.commission / totalCommission : 0;
        row.effectiveRate = row.premium    > 0 ? row.commission / row.premium     : 0;
      }

      return {
        trailingBlendedRate: totalPremium > 0 ? totalCommission / totalPremium : null,
        totalPremium,
        totalCommission,
        totalPolicies,
        byProduct,
        hasData: true,
        months,
        startDate: startStr,
        endDate:   endStr,
      };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
