// src/hooks/useProducerTargets.js
// Fetch and mutate producer performance targets.
//
// Targets are effective-dated: each save writes (or updates) the row for its
// effective_date, so changing a goal keeps the prior goal as history. Reads
// resolve the latest row whose effective_date <= the as-of date (defaults to
// today) — mirroring the cs_performance_targets pattern.

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

// Normalize an as-of value (Date | string | undefined) to a YYYY-MM-DD string.
// Undefined → today. Keeping it a string makes the query key stable.
function asOfDateStr(asOf) {
  const d = asOf ? new Date(asOf) : new Date();
  return d.toISOString().slice(0, 10);
}

export function useProducerTargets(orgId, employeeUserId, asOf) {
  const asOfStr = asOfDateStr(asOf);
  return useQuery({
    queryKey: ['producer_targets', orgId, employeeUserId, asOfStr],
    queryFn: async () => {
      if (!orgId || !employeeUserId) return null;
      // Latest goal in force as of the given date.
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .select('*')
        .eq('org_id', orgId)
        .eq('employee_user_id', employeeUserId)
        .lte('effective_date', asOfStr)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? { ...DEFAULT_TARGETS, ...data } : { ...DEFAULT_TARGETS };
    },
    enabled: !!orgId && !!employeeUserId,
    staleTime: 5 * 60 * 1000,
  });
}

// Returns the latest in-force target row per producer (one row each) as of the
// given date. Shape is unchanged from before (a flat array), so callers that
// key by employee_user_id keep working.
export function useAllProducerTargets(orgId, asOf) {
  const asOfStr = asOfDateStr(asOf);
  return useQuery({
    queryKey: ['producer_targets_all', orgId, asOfStr],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .select('*')
        .eq('org_id', orgId)
        .lte('effective_date', asOfStr)
        .order('effective_date', { ascending: true });
      if (error) throw error;
      // Ascending sort + last-wins map → the latest in-force row per producer.
      const latest = {};
      for (const row of (data || [])) latest[row.employee_user_id] = row;
      return Object.values(latest);
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveProducerTargets(orgId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeUserId, targets, effectiveDate }) => {
      // Default to today; the DB column also defaults to CURRENT_DATE. Saving
      // again on the same effective_date updates that row; a new date inserts a
      // new history row.
      const effective = effectiveDate || asOfDateStr();
      const payload = {
        ...targets,
        org_id: orgId,
        employee_user_id: employeeUserId,
        effective_date: effective,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('producer_performance_targets')
        .upsert(payload, { onConflict: 'org_id,employee_user_id,effective_date' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      // Prefix-match invalidation covers the as-of-dated query keys.
      queryClient.invalidateQueries({ queryKey: ['producer_targets', orgId, variables.employeeUserId] });
      queryClient.invalidateQueries({ queryKey: ['producer_targets_all', orgId] });
    },
  });
}
