// src/hooks/useReferralRewards.js
// React Query hooks for the referral reward system.
// Entry reads/writes are scoped to the active agency via RLS; the public
// giveaway view is served by the get_referral_giveaway SECURITY DEFINER RPC.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// Current YYYY-MM in America/New_York — matches the server-side stamping so
// the staff list shows exactly the rows the next draw will consider.
export function currentDrawPeriod() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  return `${y}-${m}`;
}

export function useReferralEntries(agencyId, period) {
  return useQuery({
    queryKey: queryKeys.referrals.entries(agencyId, period),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_entries')
        .select('id, referrer_name, referred_customer, note, created_at')
        .eq('agency_id', agencyId)
        .eq('draw_period', period)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId && !!period,
  });
}

export function useReferralDraws(agencyId) {
  return useQuery({
    queryKey: queryKeys.referrals.draws(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_draws')
        .select('id, draw_period, status, winner_display_name, entry_count, drawn_at')
        .eq('agency_id', agencyId)
        .order('draw_period', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

export function useAddReferralEntry(agencyId, period) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ referrerName, referredCustomer, note }) => {
      const { data, error } = await supabase
        .from('referral_entries')
        .insert({
          agency_id: agencyId,
          referrer_name: referrerName,
          referred_customer: referredCustomer || null,
          note: note || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.referrals.entries(agencyId, period),
      });
    },
  });
}

export function useDeleteReferralEntry(agencyId, period) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (entryId) => {
      const { error } = await supabase
        .from('referral_entries')
        .delete()
        .eq('id', entryId);
      if (error) throw error;
      return entryId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.referrals.entries(agencyId, period),
      });
    },
  });
}

// Public, no-auth read for the /giveaway page. Slug mirrors the funnel
// (?agency=slug); omitted → default agency.
export function useReferralGiveaway(slug) {
  return useQuery({
    queryKey: queryKeys.referrals.giveaway(slug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_referral_giveaway', {
        p_slug: slug || null,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}
