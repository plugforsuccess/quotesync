// src/hooks/useQuickSend.js
// Quick Send settings in the app: the agency's on/off switch (principal only) and the
// phones that can send — set-up phones, plus PIN sign-ins still within their shift.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import { quickSend } from '../lib/quickSend';

export const useQuickSendSettings = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.quickSendSettings(agencyId),
    queryFn: () => quickSend('settings', {}, { withLogin: true }),
    enabled: !!agencyId,
  });

export function useSetQuickSendEnabled(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled) => quickSend('set_enabled', { enabled }, { withLogin: true }),
    onSuccess: (r) => qc.setQueryData(queryKeys.rateChecks.quickSendSettings(agencyId), old => ({ ...(old || {}), enabled: r.enabled })),
  });
}

export const useQuickSendDevices = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.quickSendDevices(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_qs_devices')
        .select('id, user_id, producer_name, label, created_at, last_used_at, expires_at, revoked_at')
        .eq('agency_id', agencyId)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const now = Date.now();
      return (data || []).filter(d => !d.expires_at || Date.parse(d.expires_at) > now);
    },
    enabled: !!agencyId,
  });

export function useRemoveQuickSendDevice(agencyId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('rate_check_qs_devices').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.rateChecks.quickSendDevices(agencyId) }),
  });
}
