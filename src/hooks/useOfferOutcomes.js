// src/hooks/useOfferOutcomes.js
// Reads the offer_outcomes view (attempts that carried an offered premium or a
// competitor quote, joined to case outcome) and aggregates it for the Offers
// report. RLS on the underlying tables scopes the view per agency.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { summarizeOfferOutcomes } from '../lib/offerOutcomes';

export function useOfferOutcomes(agencyId) {
  return useQuery({
    queryKey: ['offer_outcomes', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offer_outcomes')
        .select('*')
        .eq('agency_id', agencyId)
        .order('attempted_at', { ascending: false })
        .limit(2000);
      if (error) throw error;
      const rows = data || [];
      return { rows, summary: summarizeOfferOutcomes(rows) };
    },
  });
}
