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
      // Server-side search across name, phone (digits), and policy number.
      const { data, error } = await supabase
        .rpc('customer_search', { p_agency_id: agencyId, p_query: q });
      if (error) throw error;
      return data || [];
    },
  });
}

// Policy-level typeahead for the service-task form — matches a partial name OR a
// policy-number prefix and returns distinct (customer, policy, product, phone),
// so typing a name fills the policy number and vice versa.
export function usePolicyAutocomplete(agencyId, term) {
  const q = (term || '').trim();
  return useQuery({
    queryKey: ['policy_autocomplete', agencyId, q.toLowerCase()],
    enabled: !!agencyId && q.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc('policy_autocomplete', { p_agency_id: agencyId, p_query: q });
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
