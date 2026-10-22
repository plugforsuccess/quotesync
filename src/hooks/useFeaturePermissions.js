// src/hooks/useFeaturePermissions.js
// Per-agency feature flags (feature_permissions), toggled by platform admins in
// AdminPlatformSettingsPage. Nav items with a `featureKey` are filtered on this.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// Feature flags enabled for an agency, as a Set of feature_key.
export const useEnabledFeatures = (agencyId) => {
  return useQuery({
    queryKey: queryKeys.featurePermissions.enabled(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feature_permissions')
        .select('feature_key, enabled')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return new Set((data || []).filter(r => r.enabled).map(r => r.feature_key));
    },
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000,
  });
};
