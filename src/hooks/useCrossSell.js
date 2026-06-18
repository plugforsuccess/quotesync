// src/hooks/useCrossSell.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCrossSellCases(agencyId, filters = {}) {
  return useQuery({
    queryKey: ['cross_sell_cases', agencyId, filters],
    queryFn: async () => {
      // FK hints required: cross_sell_cases and the case tables reference each
      // other in BOTH directions (renewal_case_id here, cross_sell_case_id
      // there), so an unhinted embed is ambiguous and PostgREST rejects the
      // whole query — the page silently showed 0 opportunities.
      let q = supabase
        .from('cross_sell_cases')
        .select(`
          *,
          renewal_cases!cross_sell_cases_renewal_case_id_fkey ( id, customer_name, product, renewal_date, status, premium ),
          pending_cases!cross_sell_cases_pending_case_id_fkey ( id, customer_name, product, cancel_effective_date, status, amount_due, stage )
        `)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false });

      if (filters.status) q = q.eq('status', filters.status);
      if (filters.match_type) q = q.eq('match_type', filters.match_type);

      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useCrossSellUploads(agencyId) {
  return useQuery({
    queryKey: ['cross_sell_uploads', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cross_sell_uploads')
        .select('*')
        .eq('agency_id', agencyId)
        .order('uploaded_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

// Rep hand-off to sales: an opportunity spotted on a renewal/cancel call gets
// referred straight onto the Cross-Sell board (match_type 'rep_referral', no
// upload batch). Also flags the originating case so the link shows both ways.
export function useReferCrossSell(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseType, caseId, customerName, policyNo,
      currentProduct, recommendedProduct, notes,
    }) => {
      const { data: created, error } = await supabase
        .from('cross_sell_cases')
        .insert({
          agency_id: agencyId,
          customer_name: customerName,
          policy_no: policyNo ?? null,
          current_product: currentProduct ?? null,
          recommended_product: recommendedProduct,
          match_type: 'rep_referral',
          status: 'new',
          notes: notes ?? null,
          renewal_case_id: caseType === 'renewal' ? caseId : null,
          pending_case_id: caseType === 'cancel' ? caseId : null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Flag the originating case so the opportunity surfaces there too.
      const table = caseType === 'renewal' ? 'renewal_cases' : 'pending_cases';
      await supabase.from(table).update({
        cross_sell_opportunity: true,
        cross_sell_product: recommendedProduct,
        cross_sell_case_id: created.id,
      }).eq('id', caseId);

      return created.id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross_sell_cases', agencyId] });
    },
  });
}

export function useUpdateCrossSellCase(agencyId, employeeId = null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase
        .from('cross_sell_cases')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;

      // Every outcome change is a touch — log it like the retention queues do
      // (pending_cancel_attempts / renewal_attempts). Feeds the household
      // touch history and, eventually, pitch-effectiveness learning.
      if (updates.status && updates.status !== 'new') {
        const { error: attErr } = await supabase.from('cross_sell_attempts').insert({
          cross_sell_case_id: id,
          agency_id: agencyId,
          employee_id: employeeId,
          method: 'phone',
          result: updates.status,
        });
        if (attErr) console.error('[cross_sell_attempts] log failed:', attErr.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cross_sell_cases', agencyId] });
    },
  });
}
