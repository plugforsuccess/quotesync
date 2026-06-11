// src/hooks/useCustomerSearch.js
// Producer customer lookup against household_directory — the persisted identity
// layer rolled up per household (so human merges are reflected, IDs are stable).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCustomerSearch(agencyId, term) {
  const q = (term || '').trim();
  return useQuery({
    queryKey: ['customer_search', agencyId, q.toLowerCase()],
    enabled: !!agencyId && q.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household_directory')
        .select('*')
        .eq('agency_id', agencyId)
        .ilike('display_name', `%${q}%`)
        .order('display_name', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
}

// Rebuild the household layer from the latest source data (run after uploads).
export function useReconcileHouseholds(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reconcile_households', { p_agency_id: agencyId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer_search', agencyId] }),
  });
}

// Merge two households into one (human-confirmed — never automatic).
export function useMergeHouseholds(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ source, target }) => {
      const { error } = await supabase.rpc('merge_households', { p_source: source, p_target: target });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customer_search', agencyId] }),
  });
}
