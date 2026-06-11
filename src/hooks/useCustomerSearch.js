// src/hooks/useCustomerSearch.js
// Producer-facing customer lookup against the unified customer_directory view —
// one row per household with their active/lost policies, contact, and open work.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useCustomerSearch(agencyId, term) {
  const q = (term || '').trim();
  return useQuery({
    queryKey: ['customer_search', agencyId, q.toLowerCase()],
    enabled: !!agencyId && q.length >= 2,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_directory')
        .select('*')
        .eq('agency_id', agencyId)
        .ilike('display_name', `%${q}%`)
        .order('display_name', { ascending: true })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });
}
