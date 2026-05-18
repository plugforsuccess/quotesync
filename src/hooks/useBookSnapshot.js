// src/hooks/useBookSnapshot.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

export function useCarriers() {
  return useQuery({
    queryKey: queryKeys.book.carriers(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carriers')
        .select('code, display_name, carrier_group, is_active')
        .eq('is_active', true)
        .order('display_name');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useBookSnapshot(agencyId) {
  return useQuery({
    queryKey: queryKeys.book.snapshot(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_agency_book_composition')
        .select('*')
        .eq('agency_id', agencyId)
        .order('total_premium', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useAddBookRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('agency_book_snapshots')
        .insert({
          ...input,
          snapshot_date: new Date().toISOString().slice(0, 10),
          is_current: true,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.book.snapshot(row.agency_id) });
    },
  });
}

export function useUpdateBookRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, changes }) => {
      const { data, error } = await supabase
        .from('agency_book_snapshots')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.book.snapshot(vars.agencyId) });
    },
  });
}

export function useDeleteBookRow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId }) => {
      const { error } = await supabase
        .from('agency_book_snapshots')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return { agencyId };
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.book.snapshot(vars.agencyId) });
    },
  });
}

/**
 * Pure aggregation function over snapshot rows. Safe to memoize.
 * @param {Array} rows From useBookSnapshot
 */
export function computeBookAggregates(rows) {
  const safeRows = rows ?? [];
  const totalPremium = safeRows.reduce((s, r) => s + Number(r.total_premium || 0), 0);
  const totalPolicies = safeRows.reduce((s, r) => s + Number(r.policy_count || 0), 0);
  const totalCommission = safeRows.reduce(
    (s, r) => s + Number(r.estimated_annual_commission || 0), 0
  );

  const carrierMap = new Map();
  for (const r of safeRows) {
    const e = carrierMap.get(r.carrier_code) ?? {
      carrier_code: r.carrier_code, carrier_name: r.carrier_name,
      premium: 0, policies: 0, commission: 0,
    };
    e.premium += Number(r.total_premium || 0);
    e.policies += Number(r.policy_count || 0);
    e.commission += Number(r.estimated_annual_commission || 0);
    carrierMap.set(r.carrier_code, e);
  }
  const byCarrier = Array.from(carrierMap.values())
    .map(c => ({ ...c, premiumShare: totalPremium > 0 ? (c.premium / totalPremium) * 100 : 0 }))
    .sort((a, b) => b.premium - a.premium);

  const productMap = new Map();
  for (const r of safeRows) {
    const e = productMap.get(r.product_key) ?? {
      product_key: r.product_key, premium: 0, policies: 0, commission: 0,
    };
    e.premium += Number(r.total_premium || 0);
    e.policies += Number(r.policy_count || 0);
    e.commission += Number(r.estimated_annual_commission || 0);
    productMap.set(r.product_key, e);
  }
  const byProduct = Array.from(productMap.values())
    .map(p => ({ ...p, premiumShare: totalPremium > 0 ? (p.premium / totalPremium) * 100 : 0 }))
    .sort((a, b) => b.premium - a.premium);

  const byCarrierProduct = safeRows.map(r => ({
    carrier_code: r.carrier_code, carrier_name: r.carrier_name,
    product_key: r.product_key, state_code: r.state_code,
    premium: Number(r.total_premium || 0),
    policies: Number(r.policy_count || 0),
    commission: Number(r.estimated_annual_commission || 0),
  }));

  return { totalPremium, totalPolicies, totalCommission, byCarrier, byProduct, byCarrierProduct };
}
