// src/hooks/useSopGoLiveDate.js
// The agency's SOP go-live date — the line analytics measure the clean "SOP
// era" from. Data before it is the preserved baseline (nothing is deleted).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useSopGoLiveDate(agencyId) {
  return useQuery({
    queryKey: ['sop_go_live_date', agencyId],
    enabled: !!agencyId,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agencies')
        .select('sop_go_live_date')
        .eq('id', agencyId)
        .single();
      if (error) throw error;
      return data?.sop_go_live_date || null; // 'YYYY-MM-DD' or null
    },
  });
}
