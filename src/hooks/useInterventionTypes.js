// src/hooks/useInterventionTypes.js
// Fetches the canonical save-tactic taxonomy (intervention_types) used by the
// InterventionPicker. Global lookup, so it's cached aggressively.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useInterventionTypes() {
  return useQuery({
    queryKey: ['intervention_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intervention_types')
        .select('code, display_name, description, captures_premium, captures_competitor, sort_order, applies_to, is_loss_reason')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    // Global, rarely-changing reference data — cache for the session.
    staleTime: 60 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
