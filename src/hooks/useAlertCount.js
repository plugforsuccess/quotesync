// src/hooks/useAlertCount.js
// Fetches unresolved discrepancy alert count for the nav badge.
// Only runs for admin users. Polls every 5 minutes + refetches on window focus.
// Scoped to org_id to prevent cross-tenant leakage.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const alertCountKeys = {
  unresolved: () => ['alert-count', 'unresolved'],
};

export function useUnresolvedAlertCount(isAdmin, orgId) {
  return useQuery({
    queryKey: alertCountKeys.unresolved(),
    queryFn: async () => {
      let query = supabase
        .from('discrepancy_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false);

      if (orgId) {
        query = query.eq('org_id', orgId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!isAdmin,
    staleTime: 60 * 1000,          // 1 minute
    refetchInterval: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: true,
  });
}

export function useInvalidateAlertCount() {
  const queryClient = useQueryClient();

  return {
    invalidateAlertCount: () =>
      queryClient.invalidateQueries({ queryKey: alertCountKeys.unresolved() }),
  };
}
