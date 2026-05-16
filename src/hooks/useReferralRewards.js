// src/hooks/useReferralRewards.js
// React Query hooks for the referral reward system.
// Entries are materialized server-side from real quoted GA leads (one per
// product line) and are read-only here; staff manage referrers and may log
// a manual call-in referral. The public giveaway view is served by the
// get_referral_giveaway SECURITY DEFINER RPC.

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
        .select(
          'id, product_line, note, created_at, ' +
            'referrer:referral_referrers(id, name, state), ' +
            'lead:leads(id, first_name, last_name)'
        )
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
        .select(
          'id, draw_period, status, winner_display_name, entry_count, ' +
            'jackpot_cents, drawn_at, payout_status, payout_method, paid_at, ' +
            'tax_doc_received, ' +
            'winner_referrer:referral_referrers(name, phone, email, state)'
        )
        .eq('agency_id', agencyId)
        .order('draw_period', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

// Referrers that have a shareable code (the viral link path).
export function useReferrerLinks(agencyId) {
  return useQuery({
    queryKey: ['referrals', 'links', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_referrers')
        .select('id, name, phone, state, referral_code, created_at')
        .eq('agency_id', agencyId)
        .not('referral_code', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
}

// Create a referrer with a generated share code (gap 3: viral link path).
export function useCreateReferrerLink(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, phone, state }) => {
      const { data: code, error: codeErr } =
        await supabase.rpc('gen_referral_code');
      if (codeErr) throw codeErr;
      const { data, error } = await supabase
        .from('referral_referrers')
        .insert({
          agency_id: agencyId,
          name: name.trim(),
          phone: phone?.trim() || null,
          state: (state || '').trim().toUpperCase() || null,
          referral_code: code,
        })
        .select('id, name, phone, state, referral_code')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['referrals', 'links', agencyId],
      });
    },
  });
}

// Mark a finalized draw's cash payout status (gap 6). Authorization is
// enforced server-side by the set_referral_payout SECURITY DEFINER RPC.
export function useSetReferralPayout(agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ drawId, status, method, taxDoc }) => {
      const { data, error } = await supabase.rpc('set_referral_payout', {
        p_draw_id: drawId,
        p_status: status,
        p_method: method ?? null,
        p_tax_doc: taxDoc ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.referrals.draws(agencyId),
      });
    },
  });
}

// Log a call-in referral: find-or-create the referrer, then add one manual
// entry for the current period. Quoted-lead entries are materialized
// server-side and should not be logged here.
export function useLogReferral(agencyId, period) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, phone, state, note }) => {
      const cleanName = name.trim();
      const cleanState = (state || '').trim().toUpperCase() || null;

      // Reuse an existing referrer with the same name (+ phone if given),
      // otherwise create one.
      let referrerId;
      let query = supabase
        .from('referral_referrers')
        .select('id')
        .eq('agency_id', agencyId)
        .ilike('name', cleanName);
      if (phone && phone.trim()) query = query.eq('phone', phone.trim());
      const { data: existing, error: findErr } = await query.limit(1);
      if (findErr) throw findErr;

      if (existing && existing.length) {
        referrerId = existing[0].id;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('referral_referrers')
          .insert({
            agency_id: agencyId,
            name: cleanName,
            phone: phone?.trim() || null,
            state: cleanState,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        referrerId = created.id;
      }

      const { data, error } = await supabase
        .from('referral_entries')
        .insert({
          agency_id: agencyId,
          referrer_id: referrerId,
          note: note?.trim() || null,
        })
        .select('id')
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

// Gap 2: link a called-in lead to its referrer (find-or-create), so the
// server materializer attributes the quote correctly and dedups against
// any later web lead from the same person.
export function useSetLeadReferrer(leadId, agencyId) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, phone, state }) => {
      const cleanName = name.trim();
      const cleanState = (state || '').trim().toUpperCase() || null;

      let referrerId;
      let query = supabase
        .from('referral_referrers')
        .select('id')
        .eq('agency_id', agencyId)
        .ilike('name', cleanName);
      if (phone && phone.trim()) query = query.eq('phone', phone.trim());
      const { data: existing, error: findErr } = await query.limit(1);
      if (findErr) throw findErr;

      if (existing && existing.length) {
        referrerId = existing[0].id;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('referral_referrers')
          .insert({
            agency_id: agencyId,
            name: cleanName,
            phone: phone?.trim() || null,
            state: cleanState,
          })
          .select('id')
          .single();
        if (insErr) throw insErr;
        referrerId = created.id;
      }

      const { error } = await supabase
        .from('leads')
        .update({ referred_by_referrer_id: referrerId })
        .eq('id', leadId)
        .eq('agency_id', agencyId);
      if (error) throw error;
      return referrerId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead_detail', leadId] });
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
