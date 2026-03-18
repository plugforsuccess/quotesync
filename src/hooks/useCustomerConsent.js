// src/hooks/useCustomerConsent.js
// React Query hooks for customer consent management.
// Handles CRUD for the customer_consent table with upsert on conflict.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// ── Fetch function ──────────────────────────────────────────────────────────

async function fetchConsentRecords(agencyId) {
  const { data, error } = await supabase
    .from('customer_consent')
    .select('*, consent_collected_by_employee:employees!customer_consent_consent_collected_by_fkey(id, first_name, last_name)')
    .eq('agency_id', agencyId)
    .order('updated_at', { ascending: false });

  if (error) {
    // Fallback without join if FK relationship isn't recognized
    const { data: fallback, error: fallbackErr } = await supabase
      .from('customer_consent')
      .select('*')
      .eq('agency_id', agencyId)
      .order('updated_at', { ascending: false });
    if (fallbackErr) throw fallbackErr;
    return fallback || [];
  }
  return data || [];
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useCustomerConsent(agencyId) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.renewals.consent(agencyId),
    queryFn: () => fetchConsentRecords(agencyId),
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (consent) => {
      const { data, error } = await supabase
        .from('customer_consent')
        .upsert(
          {
            agency_id: consent.agency_id,
            customer_phone: consent.customer_phone,
            customer_name: consent.customer_name || null,
            policy_numbers: consent.policy_numbers || null,
            autodial_consent: consent.autodial_consent ?? false,
            autodial_consent_date: consent.autodial_consent
              ? consent.autodial_consent_date || new Date().toISOString()
              : null,
            autodial_consent_source: consent.autodial_consent_source || null,
            autodial_opt_out_date: !consent.autodial_consent
              ? consent.autodial_opt_out_date || new Date().toISOString()
              : null,
            autodial_opt_out_channel: consent.autodial_opt_out_channel || null,
            consent_collected_by: consent.consent_collected_by || null,
            consent_notes: consent.consent_notes || null,
          },
          { onConflict: 'agency_id,customer_phone' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.consent(agencyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.consentMap(agencyId) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (consentId) => {
      const { error } = await supabase
        .from('customer_consent')
        .delete()
        .eq('id', consentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.consent(agencyId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.consentMap(agencyId) });
    },
  });

  return {
    data: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    upsertConsent: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    deleteConsent: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
