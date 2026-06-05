import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Frozen, paid history for the retention bonus. One row per employee per month.

// Read the ledger row for a given employee + month ('YYYY-MM'), or null if the
// month hasn't been closed yet.
export function useRetentionBonusLedger(employeeId, month) {
  const period = month ? `${month}-01` : null;
  return useQuery({
    queryKey: ['retention_bonus_ledger', employeeId, period],
    queryFn: async () => {
      if (!employeeId || !period) return null;
      const { data, error } = await supabase
        .from('retention_bonus_ledger')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('period_month', period)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!employeeId && !!period,
    staleTime: 60 * 1000,
  });
}

// Freeze (or re-freeze) a month into the ledger. Upsert keyed on the unique
// (agency_id, employee_id, period_month), so re-closing a month overwrites the
// prior snapshot rather than erroring. Principal only — enforced by RLS.
export function useFinalizeBonus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (row) => {
      const { data, error } = await supabase
        .from('retention_bonus_ledger')
        .upsert(row, { onConflict: 'agency_id,employee_id,period_month' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['retention_bonus_ledger', data.employee_id],
      });
    },
  });
}
