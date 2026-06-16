// src/hooks/useSaveIntegrity.js
// Principal-only save-integrity controls. Saves are self-reported and the save
// outcome auto-logs its own attempt, so two things keep them honest:
//   • reconcile_false_saves — flags saves whose policy later lapsed per the
//     Allstate termination report (the system of record), clawing back the credit;
//   • agency_save_integrity — the review feed: reversed saves + "unverified"
//     saves (marked saved with no real logged call, only the auto-record).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useSaveIntegrity(agencyId) {
  return useQuery({
    queryKey: ['save_integrity', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('agency_save_integrity', { p_agency_id: agencyId });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useReconcileFalseSaves(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('reconcile_false_saves', { p_agency_id: agencyId });
      if (error) throw error;
      return data; // number of saves newly flagged reversed
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['save_integrity', agencyId] });
      qc.invalidateQueries({ queryKey: ['pending_cases', agencyId] });
      qc.invalidateQueries({ queryKey: ['retention_metrics'] });
    },
  });
}
