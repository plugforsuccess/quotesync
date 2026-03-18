// src/hooks/useAiQueue.js
// React Query hook for firing the AI call queue via the fire-ai-queue edge function.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

async function fireAiQueue(agencyId, overrideSuppression = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke('fire-ai-queue', {
    body: {
      agency_id: agencyId,
      override_suppression: overrideSuppression,
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fire AI queue');
  }

  return response.data;
}

export function useFireAiQueue() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState(null);

  const mutation = useMutation({
    mutationFn: ({ agencyId, overrideSuppression }) =>
      fireAiQueue(agencyId, overrideSuppression),
    onSuccess: (data) => {
      setLastResult(data);
      // Refresh renewal policies after queue run
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all() });
    },
  });

  return {
    fireQueue: mutation.mutate,
    fireQueueAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    lastResult,
    clearResult: () => setLastResult(null),
    error: mutation.error,
  };
}
