// src/hooks/useDiscrepancyAlerts.js
// Fetches and resolves discrepancy alerts from the discrepancy_alerts table.
// Used by the DiscrepancyAlerts component on the CS Performance page.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { alertCountKeys } from './useAlertCount';

export const discrepancyAlertKeys = {
  byWeekEmployee: (weekStart, employeeId) =>
    ['discrepancy-alerts', weekStart, employeeId || 'all'],
};

export function useDiscrepancyAlerts(weekStart, employeeId) {
  return useQuery({
    queryKey: discrepancyAlertKeys.byWeekEmployee(weekStart, employeeId),
    queryFn: async () => {
      let query = supabase
        .from('discrepancy_alerts')
        .select('*')
        .eq('week_start', weekStart)
        .order('created_at', { ascending: false })
        .limit(100); // Safety cap — a single week can't realistically exceed this

      if (employeeId && employeeId !== 'all') {
        query = query.eq('employee_user_id', employeeId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, notes }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('discrepancy_alerts')
        .update({
          resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: user?.id,
          resolution_notes: notes || null,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Invalidate the alerts list for this week/employee
      queryClient.invalidateQueries({
        queryKey: discrepancyAlertKeys.byWeekEmployee(data.week_start, data.employee_user_id),
      });
      // Also invalidate the "all" variant in case the page is showing all employees
      queryClient.invalidateQueries({
        queryKey: discrepancyAlertKeys.byWeekEmployee(data.week_start, 'all'),
      });
      // Invalidate the nav badge count
      queryClient.invalidateQueries({
        queryKey: alertCountKeys.unresolved(),
      });
    },
  });
}
