// src/hooks/useOperatingReview.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// ── Dismissed slips ────────────────────────────────────────────────────────

export function useDismissedSlips(agencyId, weekStart) {
  return useQuery({
    queryKey: queryKeys.operatingReview.dismissedSlips(agencyId, weekStart),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('operating_review_dismissed_slips')
        .select('id, slip_type, slip_ref, dismissed_at, note')
        .eq('agency_id', agencyId)
        .eq('review_week', weekStart);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId && !!weekStart,
    staleTime: 2 * 60 * 1000,
  });
}

export function useDismissSlip() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.agencyId
     * @param {string} input.weekStart    YYYY-MM-DD
     * @param {string} input.slipType
     * @param {string} [input.slipRef]
     * @param {string} [input.note]
     */
    mutationFn: async ({ agencyId, weekStart, slipType, slipRef, note }) => {
      const { data, error } = await supabase
        .from('operating_review_dismissed_slips')
        .insert({
          agency_id:    agencyId,
          review_week:  weekStart,
          slip_type:    slipType,
          slip_ref:     slipRef ?? null,
          note:         note ? note.slice(0, 1000) : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operatingReview.dismissedSlips(vars.agencyId, vars.weekStart),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.operatingReview.slips(vars.agencyId, vars.weekStart),
      });
    },
  });
}

export function useUndismissSlip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId, weekStart }) => {
      const { error } = await supabase
        .from('operating_review_dismissed_slips')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { agencyId, weekStart };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operatingReview.dismissedSlips(vars.agencyId, vars.weekStart),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.operatingReview.slips(vars.agencyId, vars.weekStart),
      });
    },
  });
}

// ── Completions ────────────────────────────────────────────────────────────

export function useCompletions(agencyId, monthsBack = 6) {
  return useQuery({
    queryKey: queryKeys.operatingReview.completions(agencyId, monthsBack),
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - monthsBack);
      const cutoffISO = cutoff.toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('operating_review_completions')
        .select('id, review_week, completed_by, completed_at, note')
        .eq('agency_id', agencyId)
        .gte('review_week', cutoffISO)
        .order('review_week', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useIsWeekReviewed(agencyId, weekStart) {
  const { data: completions = [], isLoading } = useCompletions(agencyId, 6);
  const isReviewed = completions.some(c => c.review_week === weekStart);
  return { isReviewed, isLoading };
}

export function useMarkReviewed() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.agencyId
     * @param {string} input.weekStart    YYYY-MM-DD
     * @param {string} [input.note]
     */
    mutationFn: async ({ agencyId, weekStart, note }) => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      // Upsert: if the user re-marks the same week, do not duplicate.
      const { data, error } = await supabase
        .from('operating_review_completions')
        .upsert(
          {
            agency_id:    agencyId,
            review_week:  weekStart,
            completed_by: userId,
            completed_at: new Date().toISOString(),
            note:         note ? note.slice(0, 1000) : null,
          },
          { onConflict: 'agency_id,review_week' }
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.operatingReview.completions(vars.agencyId, 6),
      });
    },
  });
}

/**
 * Compute the principal's current streak of consecutive weeks reviewed.
 * Streak is broken if any week between the latest review and 6 months ago
 * was not marked reviewed.
 */
export function computeStreak(completions, currentWeekStart) {
  if (!completions || completions.length === 0) return 0;

  // Build a set of reviewed weeks (YYYY-MM-DD)
  const reviewed = new Set(completions.map(c => c.review_week));

  // Walk backward from the most recent prior week
  let streak = 0;
  const cursor = new Date(currentWeekStart + 'T00:00:00');
  cursor.setDate(cursor.getDate() - 7);  // start at the prior week

  while (true) {
    const cursorISO = cursor.toLocaleDateString('en-CA');
    if (reviewed.has(cursorISO)) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
    } else {
      break;
    }
    // Safety cap at 52 weeks
    if (streak >= 52) break;
  }
  return streak;
}
