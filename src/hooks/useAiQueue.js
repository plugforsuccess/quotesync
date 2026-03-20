// src/hooks/useAiQueue.js
// React Query hook for firing the AI call queue via the fire-ai-queue edge function.

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

async function fireAiQueue(overrideSuppression = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  // agency_id is derived server-side from the JWT — not sent by the client.
  // This prevents a malicious client from firing calls against another agency.
  const response = await supabase.functions.invoke('fire-ai-queue', {
    body: {
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
    mutationFn: ({ overrideSuppression } = {}) =>
      fireAiQueue(overrideSuppression),
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

// ── Cancel queue ─────────────────────────────────────────────────────────────

async function fireCancelQueue(overrideSuppression = false) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const response = await supabase.functions.invoke('fire-ai-queue', {
    body: {
      override_suppression: overrideSuppression,
      call_type: 'cancel',
    },
  });

  if (response.error) {
    throw new Error(response.error.message || 'Failed to fire cancel queue');
  }

  return response.data;
}

export function useFireCancelQueue() {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState(null);

  const mutation = useMutation({
    mutationFn: ({ overrideSuppression } = {}) =>
      fireCancelQueue(overrideSuppression),
    onSuccess: (data) => {
      setLastResult(data);
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
