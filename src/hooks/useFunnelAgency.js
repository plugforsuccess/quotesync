// src/hooks/useFunnelAgency.js
// MT-08: Fetch agency config for the consumer funnel based on ?agency= URL param

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useFunnelAgency() {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('agency');

  return useQuery({
    queryKey: ['funnel_agency', slug],
    queryFn: async () => {
      let query = supabase
        .from('agencies')
        .select('id, brand_name, email, agent_first_name, site_url, canopy_slug, licensed_states, target_zip_ranges, status, slug');

      if (slug) {
        query = query.eq('slug', slug);
      } else {
        query = query.eq('is_default', true);
      }

      const { data, error } = await query.single();
      if (error || !data) throw new Error('Agency not found');
      if (data.status !== 'approved') throw new Error('Agency not available');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
}
