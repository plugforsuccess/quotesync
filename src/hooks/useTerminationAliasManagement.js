// src/hooks/useTerminationAliasManagement.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

export function useSetAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.agencyId
     * @param {string} input.rawReason
     * @param {string} input.categoryCode
     */
    mutationFn: async ({ agencyId, rawReason, categoryCode }) => {
      // Upsert the alias
      const { data: alias, error: aliasError } = await supabase
        .from('termination_reason_aliases')
        .upsert(
          {
            agency_id:     agencyId,
            raw_reason:    rawReason,
            category_code: categoryCode,
            source:        'user',
          },
          { onConflict: 'agency_id,raw_reason' }
        )
        .select()
        .single();
      if (aliasError) throw aliasError;

      // Recategorize existing lapse_events rows with this raw reason
      const { data: count, error: rpcError } = await supabase.rpc(
        'recategorize_lapse_events_for_reason',
        { p_agency_id: agencyId, p_raw_reason: rawReason }
      );
      if (rpcError) throw rpcError;

      return { alias, recategorizedCount: count };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.termination.aliases(vars.agencyId),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.termination.uncategorized(vars.agencyId),
      });
      // All analytics queries depend on lapse_events.termination_category_id, so
      // invalidate the whole termination namespace.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'termination',
      });
    },
  });
}

export function useDeleteAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId, rawReason }) => {
      const { error } = await supabase
        .from('termination_reason_aliases')
        .delete()
        .eq('id', id);
      if (error) throw error;

      // Recompute so any existing lapse_events fall back to the heuristic
      const { error: rpcError } = await supabase.rpc(
        'recategorize_lapse_events_for_reason',
        { p_agency_id: agencyId, p_raw_reason: rawReason }
      );
      if (rpcError) throw rpcError;

      return { agencyId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'termination',
      });
    },
  });
}
