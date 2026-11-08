// src/hooks/useContactLists.js
// Contact lists: the principal makes them (Lists page); everyone on the team adds people
// (Add to List). RLS: everyone sees the lists; the principal sees everyone on them,
// a producer only the people they added.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const KEY = 'contact_lists';

export function useContactLists({ includeArchived = false } = {}) {
  const { currentAgencyId } = useAuth();
  return useQuery({
    queryKey: [KEY, currentAgencyId, includeArchived],
    enabled: !!currentAgencyId,
    queryFn: async () => {
      let q = supabase.from('contact_lists').select('id, name, follow_up_enabled, is_default, archived_at, created_at')
        .eq('agency_id', currentAgencyId).order('is_default', { ascending: false }).order('name');
      if (!includeArchived) q = q.is('archived_at', null);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

/** Everyone on the agency's lists (principal), with who unsubscribed. */
export function useListMembers() {
  const { currentAgencyId } = useAuth();
  return useQuery({
    queryKey: [KEY, 'members', currentAgencyId],
    enabled: !!currentAgencyId,
    queryFn: async () => {
      const [{ data, error }, { data: outs }] = await Promise.all([
        supabase.from('contact_list_members')
          .select('id, list_id, first_name, last_name, email, phone, notes, source, added_by_name, followup_sent_at, created_at')
          .eq('agency_id', currentAgencyId).order('created_at', { ascending: false }).limit(5000),
        supabase.from('dd_email_opt_outs').select('email'),
      ]);
      if (error) throw error;
      const unsub = new Set((outs || []).map(o => String(o.email).toLowerCase()));
      return (data || []).map(m => ({ ...m, unsubscribed: unsub.has(m.email.toLowerCase()) }));
    },
  });
}

export function useSaveList() {
  const qc = useQueryClient();
  const { currentAgencyId } = useAuth();
  return useMutation({
    // { id?, name?, follow_up_enabled?, is_default?, archived_at? }
    mutationFn: async ({ id, ...patch }) => {
      // One default per agency: clear the old one first.
      if (patch.is_default) {
        const { error } = await supabase.from('contact_lists').update({ is_default: false })
          .eq('agency_id', currentAgencyId).eq('is_default', true).neq('id', id || '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
      }
      if (patch.archived_at) patch.is_default = false;
      const q = id
        ? supabase.from('contact_lists').update(patch).eq('id', id)
        : supabase.from('contact_lists').insert({ agency_id: currentAgencyId, ...patch });
      const { data, error } = await q.select('id').single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Add one person. Returns { already: true } if they're on that list already. */
export function useAddToList() {
  const qc = useQueryClient();
  const { currentAgencyId, user, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ list_id, first_name, last_name, email, phone, lead_id, source = 'app' }) => {
      const { error } = await supabase.from('contact_list_members').insert({
        list_id, agency_id: currentAgencyId, first_name, last_name: last_name || null, email, phone: phone || null,
        lead_id: lead_id || null, source, added_by: user?.id, added_by_name: profile?.full_name || null,
      });
      if (error?.code === '23505') return { already: true };
      if (error) throw error;
      return { added: true };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'members'] }),
  });
}

/** Import many (principal). Skips people already on the list. Returns { added, already }. */
export function useImportToList() {
  const qc = useQueryClient();
  const { currentAgencyId, user, profile } = useAuth();
  return useMutation({
    mutationFn: async ({ list_id, people }) => {
      const { data: existing, error: e1 } = await supabase.from('contact_list_members').select('email').eq('list_id', list_id);
      if (e1) throw e1;
      const have = new Set((existing || []).map(r => r.email.toLowerCase()));
      const fresh = people.filter(p => !have.has(p.email));
      for (let i = 0; i < fresh.length; i += 500) {
        const rows = fresh.slice(i, i + 500).map(p => ({
          ...p, list_id, agency_id: currentAgencyId, source: 'import', added_by: user?.id, added_by_name: profile?.full_name || null,
        }));
        const { error } = await supabase.from('contact_list_members').insert(rows);
        if (error) throw error;
      }
      return { added: fresh.length, already: people.length - fresh.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY, 'members'] }),
  });
}
