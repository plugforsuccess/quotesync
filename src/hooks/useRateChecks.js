// src/hooks/useRateChecks.js
// React Query hooks for the Rate Checks inbox (/agency/leads/rate-checks).
// Rows land via the public rate-check edge function; agents correct the
// extraction here and enter the Allstate quote through rate-check-outcome.

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

export const RATE_CHECK_LIST_COLUMNS = `
  id, agency_id, lead_id, created_at, first_name, phone, zip, status,
  carrier, policy_type, current_premium, term_months, annual_premium,
  allstate_premium, delta, delta_pct, extract_confidence, extract_error,
  image_path, image_media_type, policy_number, policy_number_last4, term_source, effective_date,
  expiration_date, vehicle_count, driver_count, vehicles, coverages,
  insured_address, extracted, quote_note, quoted_at, outcome_at
`;

// Rate checks for an agency, newest first. `statuses` empty/undefined = all.
// Subscribes to realtime changes so new uploads appear without a refresh.
export const useRateChecks = (agencyId, statuses) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`rate-checks-${agencyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rate_checks',
        filter: `agency_id=eq.${agencyId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [agencyId, queryClient]);

  return useQuery({
    queryKey: queryKeys.rateChecks.list(agencyId, statuses),
    queryFn: async () => {
      let query = supabase
        .from('rate_checks')
        .select(RATE_CHECK_LIST_COLUMNS)
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (statuses?.length) query = query.in('status', statuses);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

// 60-minute signed URL for the dec-page image (storage RLS limits this to the
// row's agency).
export const useRateCheckImageUrl = (imagePath) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.image(imagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('dec-pages')
        .createSignedUrl(imagePath, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!imagePath,
    staleTime: 50 * 60 * 1000, // refresh before the 60-min URL expires
  });
};

// Agent corrections to the extracted fields. annual_premium is recomputed
// from the term premium + term here so the trigger re-scores any quote.
export const useUpdateRateCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('rate_checks')
        .update(updates)
        .eq('id', id)
        .select(RATE_CHECK_LIST_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// Enter the Allstate quote → rate-check-outcome (won/lost, lead update, SMS).
export const useEnterRateCheckQuote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rateCheckId, allstatePremium, quoteNote }) => {
      const { data, error } = await supabase.functions.invoke('rate-check-outcome', {
        body: { rate_check_id: rateCheckId, allstate_premium: allstatePremium, quote_note: quoteNote || null },
      });
      if (error) {
        // FunctionsHttpError carries the JSON body on .context
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* keep default */ }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
    },
  });
};

export const useRateCheckWinMap = (agencyId) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.winMap(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_win_map')
        .select('carrier, policy_type, zip5, quoted, wins, win_rate_pct, avg_savings_when_won')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

/** annual = term premium × 12 / term months (term null → as printed). */
export function annualize(premium, termMonths) {
  if (premium == null || premium === '') return null;
  const p = Number(premium);
  if (!Number.isFinite(p)) return null;
  const t = Number(termMonths);
  return t > 0 ? Math.round(p * (12 / t) * 100) / 100 : p;
}
