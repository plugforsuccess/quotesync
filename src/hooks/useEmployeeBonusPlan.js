import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Live, editable retention-bonus terms for a single employee.
// Returns the plan row or null when none is configured.

export function useEmployeeBonusPlan(employeeId) {
  return useQuery({
    queryKey: ['employee_bonus_plan', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data, error } = await supabase
        .from('employee_bonus_plans')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });
}

// Upsert a plan (principal only — enforced by RLS). Keyed on employee_id so a
// principal editing terms updates the single current plan in place.
export function useSaveBonusPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (plan) => {
      const { data, error } = await supabase
        .from('employee_bonus_plans')
        .upsert(plan, { onConflict: 'employee_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['employee_bonus_plan', data.employee_id],
      });
    },
  });
}
