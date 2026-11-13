// Mark as Test (principal only): hide test uploads, leads and affiliates from every staff
// view and count, and bring them back. The database hides flagged rows from every query;
// these two calls are the only way to flag them or see them.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export const useTestRecords = (agencyId) =>
  useQuery({
    queryKey: ['test_records', agencyId],
    enabled: !!agencyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('test_records', { p_agency: agencyId });
      if (error) throw error;
      return data || { rate_checks: [], leads: [], affiliates: [] };
    },
  });

export const useSetTestFlag = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, id, on }) => {
      const { data, error } = await supabase.rpc('set_test_flag', { p_kind: kind, p_id: id, p_on: on });
      if (error) throw error;
      return data;
    },
    // Lists, counts and payouts all change: refresh everything.
    onSuccess: () => queryClient.invalidateQueries(),
  });
};
