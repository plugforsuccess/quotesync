// src/lib/queryClient.js
// Extracted from App.jsx to break circular dependency: App → AuthContext → App.
// Both App.jsx and AuthContext.jsx import from this module instead.

import { QueryClient, focusManager } from '@tanstack/react-query';
import { supabase } from './supabase';

// Disable focus-based refetching. Supabase auth uses a single internal lock
// for all getSession() calls. React Query refetches each call getSession()
// internally for auth headers — 9+ parallel refetches on tab restore exhaust
// the lock and cause supabase.auth.signOut() and other auth ops to hang.
// Data freshness is maintained by: staleTime expiry, explicit invalidateQueries
// after mutations, and refetchOnReconnect for network restore.
focusManager.setEventListener(() => {
  // Intentional no-op — see comment above.
  return () => {};
});

// Configure React Query with auth-aware error handling
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,  // disabled to prevent auth lock contention
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        // Never retry auth failures — the token is dead, retrying just cascades errors
        if (error?.status === 401 || error?.status === 403) {
          return false;
        }
        return failureCount < 1;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

// Global auth error handler — verify session is truly dead before signing out.
// On tab focus, React Query refetches may race ahead of the Supabase token
// refresh, producing transient 401s. If the session is still valid after
// refresh, skip the sign-out — the next refetch will succeed with the new token.
//
// Debounced: if 5 queries all fail with 401 at once (e.g. on tab restore with
// an expired token), we fire only ONE getSession() check instead of 5.
// This prevents lock contention in the Supabase auth client.
let authCheckInFlight = false;
const handleAuthError = (source) => {
  if (authCheckInFlight) return;
  authCheckInFlight = true;
  // Wait briefly — token refresh may be in progress (lock held by Supabase internals).
  // Checking immediately can return null even when a valid session exists in storage
  // because the refresh hasn't completed yet.
  setTimeout(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        console.warn(`[${source}] 401 was transient — session still valid`);
      } else {
        // Log but do not sign out. A null here can mean lock contention
        // rather than a dead session. The user will hit the login redirect
        // naturally via ProtectedRoute if their session is truly expired.
        console.warn(`[${source}] 401 with no session — may be lock contention, not signing out`);
      }
    }).finally(() => {
      authCheckInFlight = false;
    });
  }, 500);
};

queryClient.getQueryCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    handleAuthError('QueryCache');
  }
};

queryClient.getMutationCache().config.onError = (error) => {
  if (error?.status === 401 || error?.status === 403) {
    handleAuthError('MutationCache');
  }
};
