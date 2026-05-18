// src/hooks/useAgencyConfig.js
// Lightweight readers for per-agency product and tier configuration.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useAgencyProducts(agencyId) {
  return useQuery({
    queryKey: ['agency-products', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_products')
        .select('id, product_key, label, color, is_active, sort_order, is_vc_eligible')
        .eq('agency_id', agencyId)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000,
  });
}

export function useAgencyTiers(agencyId) {
  return useQuery({
    queryKey: ['agency-tiers', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_tiers')
        .select('id, tier_key, label, color, sort_order')
        .eq('agency_id', agencyId)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000,
  });
}
