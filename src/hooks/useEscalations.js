// src/hooks/useEscalations.js
// Case escalation = a real hand-off, not a relabel. A rep raises an escalation
// on a renewal/cancel they can't close themselves (needs a licensed agent or
// principal sign-off); the RPC flags the case, drops an audit note, and notifies
// the principals. The principal works the open list and resolves each one.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Open escalation (if any) for a single case — drives the "already escalated"
// banner inside the detail modal so a rep doesn't double-escalate.
export function useCaseEscalation(caseType, caseId) {
  return useQuery({
    queryKey: ['case_escalation', caseType, caseId],
    enabled: !!caseType && !!caseId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_escalations')
        .select('*')
        .eq('case_type', caseType)
        .eq('case_id', caseId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    },
  });
}

export function useEscalateCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ caseType, caseId, reason, note }) => {
      const { data, error } = await supabase.rpc('escalate_case', {
        p_case_type: caseType, p_case_id: caseId,
        p_reason: reason ?? null, p_note: note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['case_escalation', vars.caseType, vars.caseId] });
      qc.invalidateQueries({ queryKey: ['open_escalations'] });
      qc.invalidateQueries({ queryKey: ['case_notes', vars.caseType, vars.caseId] });
    },
  });
}

// Principal inbox — every open escalation across the agency, newest first.
export function useOpenEscalations(agencyId) {
  return useQuery({
    queryKey: ['open_escalations', agencyId],
    enabled: !!agencyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_escalations')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useResolveEscalation(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }) => {
      const { error } = await supabase.rpc('resolve_escalation', {
        p_id: id, p_note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['open_escalations', agencyId] }),
  });
}
