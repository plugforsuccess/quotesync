// src/hooks/useCaseNotes.js
// Append-only, typed/tagged case-note feed + cross-case full-text search.
// Backed by the case_notes table (server-stamped author/time, immutable body).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const NOTE_TYPES = [
  { value: 'general',      label: 'General' },
  { value: 'call_summary', label: 'Call Summary' },
  { value: 'service',      label: 'Service' },
  { value: 'billing',      label: 'Billing' },
  { value: 'followup',     label: 'Follow-up' },
  { value: 'escalation',   label: 'Escalation' },
  { value: 'internal',     label: 'Internal' },
];

export const NOTE_TYPE_COLOR = {
  general: '#94A3B8', call_summary: '#3B82F6', service: '#10B981',
  billing: '#F59E0B', followup: '#8B5CF6', escalation: '#EF4444', internal: '#6B7280',
};

// Per-case feed (list + add + pin).
export function useCaseNotes(caseType, caseId) {
  const qc = useQueryClient();
  const key = ['case_notes', caseType, caseId];

  const query = useQuery({
    queryKey: key,
    enabled: !!caseType && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('case_notes')
        .select('*')
        .eq('case_type', caseType)
        .eq('case_id', caseId)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const add = useMutation({
    mutationFn: async ({ agencyId, policyNo, customerName, noteType, tags, body }) => {
      const { error } = await supabase.from('case_notes').insert({
        agency_id: agencyId,
        case_type: caseType,
        case_id: caseId,
        policy_no: policyNo ?? null,
        customer_name: customerName ?? null,
        note_type: noteType || 'general',
        tags: tags || [],
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const togglePin = useMutation({
    mutationFn: async ({ id, pinned }) => {
      const { error } = await supabase.from('case_notes').update({ pinned }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { ...query, add, togglePin };
}

// Cross-case search (full-text over body/policy/customer + type/tag filters).
export function useNotesSearch(agencyId, { text, noteType, tag } = {}) {
  return useQuery({
    queryKey: ['case_notes_search', agencyId, text, noteType, tag],
    enabled: !!agencyId,
    queryFn: async () => {
      let q = supabase.from('case_notes').select('*').eq('agency_id', agencyId);
      if (text && text.trim()) q = q.textSearch('body_tsv', text.trim(), { type: 'websearch' });
      if (noteType) q = q.eq('note_type', noteType);
      if (tag && tag.trim()) q = q.contains('tags', [tag.trim()]);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
      if (error) throw error;
      return data || [];
    },
  });
}
