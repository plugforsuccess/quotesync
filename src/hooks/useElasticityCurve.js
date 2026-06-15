// src/hooks/useElasticityCurve.js
// Reads the retention-elasticity views (premium-change buckets -> retain rate,
// and the same split by whether a save intervention was logged). The empirical
// counterpart to the tenure-based churn model — answers "how much rate increase
// does THIS book actually tolerate before customers walk?"
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useElasticityCurve(agencyId) {
  return useQuery({
    queryKey: ['elasticity_curve', agencyId],
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const [{ data: curve, error: e1 }, { data: lift, error: e2 }] = await Promise.all([
        supabase.from('renewal_elasticity_curve').select('*')
          .eq('agency_id', agencyId).order('bucket_order'),
        supabase.from('renewal_elasticity_by_intervention').select('*')
          .eq('agency_id', agencyId).order('bucket_order'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { curve: curve || [], lift: lift || [] };
    },
  });
}
