// src/hooks/useAlertCount.js
// Fetches unresolved discrepancy alert count for the nav badge.
// Only runs for admin users. Polls every 5 minutes + refetches on window focus.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const alertCountKeys = {
  unresolved: () => ['alert-count', 'unresolved'],
};

export function useUnresolvedAlertCount(isAdmin) {
  return useQuery({
    queryKey: alertCountKeys.unresolved(),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('discrepancy_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('resolved', false);

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
