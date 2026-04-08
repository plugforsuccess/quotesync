// src/hooks/useProducerTargets.js
// Fetch and mutate producer performance targets.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const DEFAULT_TARGETS = {
  outbound_calls_weekly:  75,
  avg_calls_per_day:      15,
  vc_items_monthly:       23,
  premium_monthly:        0,
  grade_a_vc_items:       28,
  grade_b_vc_items:       23,
  grade_c_vc_items:       18,
  grade_a_outbound:       90,
  grade_b_outbound:       75,
  grade_c_outbound:       55,
};

export { DEFAULT_TARGETS as PRODUCER_DEFAULT_TARGETS };

export function useProducerTargets(orgId, employeeUserId) {
  return useQuery({
    queryKey: ['producer_targets', orgId, employeeUserId],
    queryFn: async () => {
      if (!orgId || !employeeUserId) return null;
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...DEFAULT_TARGETS, ...data } : { ...DEFAULT_TARGETS };
    },
    enabled: !!orgId && !!employeeUserId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useAllProducerTargets(orgId) {
  return useQuery({
    queryKey: ['producer_targets_all', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .select('*')
        .eq('org_id', orgId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveProducerTargets(orgId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeUserId, targets }) => {
      const payload = {
        org_id: orgId,
        employee_user_id: employeeUserId,
        ...targets,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .upsert(payload, { onConflict: 'org_id,employee_user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['producer_targets', orgId, variables.employeeUserId] });
      queryClient.invalidateQueries({ queryKey: ['producer_targets_all', orgId] });
    },
  });
}
