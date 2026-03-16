// src/contexts/AuthContext.jsx
// Global authentication context with two-plane RBAC support
// Platform plane: internal staff (platform_master_admin, platform_admin, platform_support, platform_editor, platform_auditor)
// Tenant plane: agency users (agent, manager, producer, viewer)

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, authChannel } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { mapRow } from '../hooks/useRevenueEntries';
import { LAPSE_PORTFOLIO_POINTS } from '../lib/lapseConstants';

const AuthContext = createContext({
  user: null,
  profile: null,
  // Legacy role field (for backward compatibility)
  role: 'viewer',
  // Two-plane RBAC
  isPlatformUser: false,
  platformRole: null,
  agencyMemberships: [],
  currentAgencyId: null,
  currentAgencyRole: null,
  // Impersonation
  isImpersonating: false,
  impersonationSession: null,
  // State
  loading: true,
  authError: null,
  // Actions
  signOut: async () => {},
  resetSession: async () => {},
  refreshUser: async () => {},
  setCurrentAgency: () => {},
  startImpersonation: async () => {},
  endImpersonation: async () => {}
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

// Platform role hierarchy (higher = more permissions)
const PLATFORM_ROLE_HIERARCHY = {
  platform_auditor: 1,
  platform_editor: 2,
  platform_support: 3,
  platform_admin: 4,
  platform_master_admin: 5
};

// Agency role hierarchy (Allstate terminology: agent = principal, producer = staff)
const AGENCY_ROLE_HIERARCHY = {
  producer: 1,
  agent: 2
  // Future: viewer: 0, manager: 2 (insert between producer/agent)
};

// --- Boot helpers ---
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isAbortError(e) {
  return e?.name === 'AbortError';
}

// Clear all Supabase auth tokens from storage (custom key + default sb-* keys)
function clearSupabaseAuthTokenFromStorage() {
  try {
    // Remove qs_auth_token in case it exists from the previous custom key
    localStorage.removeItem('qs_auth_token');
    // Clear default Supabase keys
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        localStorage.removeItem(k);
      }
    }
  } catch (_) {
    // ignore (SSR / sandboxed iframe)
  }
}

// A safe getSession that retries on Supabase lock aborts
async function safeGetSession(retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await supabase.auth.getSession();
    } catch (e) {
      if (!isAbortError(e) || attempt === retries) throw e;
      await sleep(150);
    }
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null); // Legacy — null until RBAC resolves
  const [isPlatformUser, setIsPlatformUser] = useState(false);
  const [platformRole, setPlatformRole] = useState(null);
  const [agencyMemberships, setAgencyMemberships] = useState([]);
  const [currentAgencyId, setCurrentAgencyId] = useState(null);
  const [currentAgencyRole, setCurrentAgencyRole] = useState(null);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonationSession, setImpersonationSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const requestIdRef = useRef(0);

  // Fetch user profile and memberships
  const fetchUserProfile = async (currentUser) => {
    const requestId = ++requestIdRef.current;

    if (!currentUser) {
      resetState();
      setAuthError(null);
      return;
    }

    console.log('[AUTHZ] resolving for uid=', currentUser.id);

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, platform_role, is_platform_user')
        .eq('id', currentUser.id)
        .single();

      if (profileError) {
        console.error('[AUTHZ] profile fetch error', { uid: currentUser.id, profileError });
        throw new Error(`PROFILE_FETCH_FAILED:${profileError.message}`);
      }

      if (!profileData || profileData.id !== currentUser.id) {
        throw new Error('AUTH_UID_PROFILE_MISMATCH');
      }

      const { data: memberships, error: membershipError } = await supabase
        .from('agency_memberships')
        .select(`
          id,
          agency_id,
          agency_role,
          status,
          agencies (
            id,
            name,
            brand_name,
            status
          )
        `)
        .eq('user_id', currentUser.id)
        .eq('status', 'active');

      if (membershipError) {
        console.error('[AUTHZ] membership fetch error', { uid: currentUser.id, membershipError });
        throw new Error(`MEMBERSHIP_FETCH_FAILED:${membershipError.message}`);
      }

      let activeImpersonation = null;
      if (profileData?.is_platform_user) {
        const { data: impersonation, error: impError } = await supabase
          .from('impersonation_sessions')
          .select('*')
          .eq('admin_user_id', currentUser.id)
          .eq('is_active', true)
          .maybeSingle();

        if (impError) {
          console.warn('[AuthProvider] Impersonation query failed (non-critical):', impError);
        }
        activeImpersonation = impersonation;
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      setAuthError(null);
      setUser(currentUser);
      setProfile(profileData);
      setRole(profileData?.role || 'viewer');
      setIsPlatformUser(profileData?.is_platform_user || false);
      setPlatformRole(profileData?.platform_role || null);
      setAgencyMemberships(memberships || []);
      setIsImpersonating(!!activeImpersonation);
      setImpersonationSession(activeImpersonation);

      const storedAgencyId = localStorage.getItem('currentAgencyId');
      const activeMemberships = (memberships || []).filter(m =>
        m.status === 'active' && m.agencies?.status === 'approved'
      );

      if (activeMemberships.length > 0) {
        const preferred = activeMemberships.find(m => m.agency_id === storedAgencyId);
        const current = preferred || activeMemberships[0];
        setCurrentAgencyId(current.agency_id);
        setCurrentAgencyRole(current.agency_role);
      } else if (activeImpersonation) {
        setCurrentAgencyId(activeImpersonation.target_agency_id);
        setCurrentAgencyRole('viewer');
      } else {
        setCurrentAgencyId(null);
        setCurrentAgencyRole(null);
      }

      // Prefetch all primary page data so every page cache is warm on login.
      // This eliminates the cold-cache empty state when navigating to an
      // unvisited page after window minimize/restore.
      const resolvedAgencyId = activeMemberships[0]?.agency_id
        ?? activeImpersonation?.target_agency_id
        ?? null;

      if (resolvedAgencyId) {
        const today = new Date();
        const yearStart = `${today.getFullYear()}-01-01`;
        const yearEnd   = `${today.getFullYear()}-12-31`;

        // Fire all prefetches in parallel — don't await, let them warm in background.
        // NOTE: funnel_metrics is intentionally skipped — its queryFn runs
        // computeAllMetrics which lives inside useFunnelMetrics. Prefetching raw
        // leads under that key would cause a shape mismatch. The dashboard is the
        // landing page and always loads fresh anyway.
        Promise.allSettled([
          // current_agency — used by every authenticated page
          queryClient.prefetchQuery({
            queryKey: ['current_agency', currentUser.id],
            queryFn: async () => {
              const { data } = await supabase
                .from('agency_memberships')
                .select('agency_id, agency_role, agencies(id, name, brand_name)')
                .eq('user_id', currentUser.id)
                .eq('status', 'active')
                .limit(1)
                .single();
              return data ? { ...data, role: data.agency_role } : null;
            },
            staleTime: 10 * 60 * 1000,
          }),

          // agency_leads — Leads page
          queryClient.prefetchQuery({
            queryKey: ['agency_leads', resolvedAgencyId, {}],
            queryFn: async () => {
              const { data } = await supabase
                .from('leads')
                .select('*')
                .eq('agency_id', resolvedAgencyId)
                .neq('status', 'partial')
                .order('created_at', { ascending: false })
                .limit(50);
              return data || [];
            },
            staleTime: 2 * 60 * 1000,
          }),

          // revenue_entries — Revenue page
          queryClient.prefetchQuery({
            queryKey: ['revenue_entries', resolvedAgencyId, yearStart, yearEnd],
            queryFn: async () => {
              const { data } = await supabase
                .from('revenue_entries')
                .select('*')
                .eq('agency_id', resolvedAgencyId)
                .gte('issued_date', yearStart)
                .lte('issued_date', yearEnd)
                .order('issued_date', { ascending: false });
              return (data || []).map(mapRow);
            },
            staleTime: 2 * 60 * 1000,
          }),

          // revenue_entries_ytd — Revenue producer breakdown
          queryClient.prefetchQuery({
            queryKey: ['revenue_entries_ytd', resolvedAgencyId],
            queryFn: async () => {
              const { data } = await supabase
                .from('revenue_entries')
                .select('*')
                .eq('agency_id', resolvedAgencyId)
                .gte('issued_date', yearStart)
                .lte('issued_date', yearEnd)
                .order('issued_date', { ascending: false });
              return data || [];
            },
            staleTime: 2 * 60 * 1000,
          }),

          // lapse_events — Book Health page
          queryClient.prefetchQuery({
            queryKey: ['lapse_events', resolvedAgencyId],
            queryFn: async () => {
              const { data } = await supabase
                .from('lapse_events')
                .select('*')
                .eq('agency_id', resolvedAgencyId)
                .order('lapse_date', { ascending: true });
              return data || [];
            },
            staleTime: 2 * 60 * 1000,
          }),

          // lapse_events_summary — Book Health summary view
          queryClient.prefetchQuery({
            queryKey: ['lapse_events_summary', resolvedAgencyId],
            queryFn: async () => {
              const { data } = await supabase
                .from('lapse_events')
                .select('report_month, product, premium, item_count')
                .eq('agency_id', resolvedAgencyId)
                .order('report_month', { ascending: false });
              const byMonth = {};
              (data ?? []).forEach(r => {
                const m = r.report_month;
                if (!byMonth[m]) byMonth[m] = { report_month: m, items: 0, points: 0, premium: 0 };
                byMonth[m].items += r.item_count ?? 1;
                byMonth[m].points += (LAPSE_PORTFOLIO_POINTS[r.product] ?? 0) * (r.item_count ?? 1);
                byMonth[m].premium += r.premium ?? 0;
              });
              return Object.values(byMonth).sort((a, b) => b.report_month.localeCompare(a.report_month));
            },
            staleTime: 2 * 60 * 1000,
          }),

          // agency_commission_rates — Dashboard + Revenue
          queryClient.prefetchQuery({
            queryKey: ['agency_commission_rates', resolvedAgencyId],
            queryFn: async () => {
              const { data } = await supabase
                .from('agency_commission_rates')
                .select('product_key, tier_key, rate')
                .eq('agency_id', resolvedAgencyId);
              return data || [];
            },
            staleTime: 10 * 60 * 1000,
          }),

          // agency_carrier_config — Dashboard + Revenue
          queryClient.prefetchQuery({
            queryKey: ['agency_carrier_config', resolvedAgencyId],
            queryFn: async () => {
              const { data } = await supabase
                .from('agency_carrier_config')
                .select('commissionable_factor, commission_goal, premium_goal, base_commission_floor')
                .eq('agency_id', resolvedAgencyId)
                .single();
              return data || null;
            },
            staleTime: 10 * 60 * 1000,
          }),

          // ytd_blended — Staffing Capacity scenarios (blended avg premium + commission rate)
          queryClient.prefetchQuery({
            queryKey: ['ytd_blended', resolvedAgencyId, today.getFullYear()],
            queryFn: async () => {
              const { data, error } = await supabase
                .from('revenue_entries')
                .select('premium, product, tier, policy_count')
                .eq('agency_id', resolvedAgencyId)
                .gte('issued_date', yearStart)
                .lte('issued_date', yearEnd);
              if (error || !data || data.length === 0) return null;
              // Mirror calcCommission from useYTDBlended
              const CF = { auto: 0.998, specialty_auto: 0.998, ho: 0.935, condo: 0.959, renters: 1.0, landlord: 1.0, pup: 1.0, manufactured: 1.0, boat: 1.0, motor_club: 1.0, other: 1.0 };
              const CR = { auto: { preferred: 0.25, bundled: 0.20, monoline: 0.15 }, ho: { preferred: 0.29, bundled: 0.25, monoline: 0.16 }, renters: { preferred: 0.26, bundled: 0.21, monoline: 0.15 }, other: { preferred: 0.26, bundled: 0.21, monoline: 0.15 } };
              let totalPremium = 0, totalCommission = 0, totalPolicies = 0;
              for (const e of data) {
                const prem = parseFloat(e.premium) || 0;
                const policies = e.policy_count || 1;
                const rates = CR[e.product] ?? CR.other;
                const factor = CF[e.product] ?? 1.0;
                const tier = e.tier ?? 'monoline';
                totalPremium += prem;
                totalCommission += prem * factor * (rates[tier] ?? rates.monoline);
                totalPolicies += policies;
              }
              if (totalPolicies === 0 || totalPremium === 0) return null;
              return {
                avgPremiumPerPolicy: totalPremium / totalPolicies,
                avgCommissionPerPolicy: totalCommission / totalPolicies,
                blendedCommissionRate: totalCommission / totalPremium,
                totalPolicies, totalPremium, totalCommission,
              };
            },
            staleTime: 5 * 60 * 1000,
          }),
        ]).catch(() => {}); // prefetch failures are non-fatal — pages will fetch on demand
      }

      console.log('[AUTHZ] resolved', {
        uid: currentUser.id,
        platformRole: profileData?.platform_role,
        membershipCount: memberships?.length || 0,
        isImpersonating: !!activeImpersonation
      });
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error('[AUTHZ] error', {
        uid: currentUser.id,
        message: error?.message || 'Unknown authz error',
        error
      });

      // Fail closed: keep user set (so we know *who* is authenticated)
      // but do NOT grant any role — no fake "viewer" fallback.
      // The app should render a blocking error screen with Retry / Reset Session.
      setUser(currentUser);
      setProfile(null);
      setRole(null);
      setIsPlatformUser(false);
      setPlatformRole(null);
      setAgencyMemberships([]);
      setCurrentAgencyId(null);
      setCurrentAgencyRole(null);
      setIsImpersonating(false);
      setImpersonationSession(null);
      setAuthError({
        code: 'AUTHZ_RESOLUTION_FAILED',
        message: "We couldn't load your permissions. Please retry or reset your session.",
        timestamp: new Date().toISOString(),
        details: error?.message || 'Unknown error',
        canRetry: true,
        canReset: true
      });
    }
  };

  const resetState = () => {
    setUser(null);
    setProfile(null);
    setRole(null);
    setIsPlatformUser(false);
    setPlatformRole(null);
    setAgencyMemberships([]);
    setCurrentAgencyId(null);
    setCurrentAgencyRole(null);
    setIsImpersonating(false);
    setImpersonationSession(null);
    setAuthError(null);
    // NOTE: Do NOT clear qs_active_plane here. resetState() is called during
    // normal init flows before auth resolves. Clearing here causes the nav to
    // flash to consumer on every refresh. The useEffect below handles clearing
    // qs_active_plane only after confirmed sign-out (!loading && !user).
  };

  // Initialize auth state on mount (self-healing boot)
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        setLoading(true);

        // 1) Rehydrate session (retry on Supabase lock abort)
        const { data, error } = await safeGetSession(2);

        // Don't throw on returned errors — getSession() may fail to refresh
        // the token due to a transient network issue while the session itself
        // (in localStorage) is still perfectly valid.  Throwing here sends us
        // into the catch block that nukes the stored token, which is the
        // "refresh kills the session" bug.  The onAuthStateChange listener
        // already handles genuine session expiry (SIGNED_OUT event).
        if (error) {
          console.warn('[AUTH] getSession returned error (non-fatal):', error.message);
        }

        const session = data?.session;

        if (!mounted) return;

        console.log('[AUTH] session loaded', { hasSession: !!session, uid: session?.user?.id || null });

        // 2) If we have a session, resolve RBAC
        if (session?.user) {
          await fetchUserProfile(session.user);
          if (!mounted) return;
          setLoading(false);
          return;
        }

        // 3) No session => clean reset
        resetState();
        setLoading(false);
      } catch (e) {
        console.error('[AUTH] initAuth failed:', e);

        if (!mounted) return;

        // If Supabase session state is corrupted or lock-aborted repeatedly,
        // self-heal to a clean signed-out state.
        if (isAbortError(e)) {
          console.warn('[AUTH] init aborted; retrying once after delay');
          await sleep(300); // slightly longer delay to let lock contention clear
          if (!mounted) return;
          try {
            const { data } = await safeGetSession(1);
            if (data?.session?.user) {
              await fetchUserProfile(data.session.user);
            } else {
              resetState();
            }
          } catch (e2) {
            // Second abort: still don't sign out — just reset UI state silently.
            // The session in storage is likely still valid; Supabase will recover
            // it on the next API call. Signing out here destroys a valid session.
            console.warn('[AUTH] init double-abort; resetting UI state only (not signing out)', e2);
            resetState();
          } finally {
            if (mounted) setLoading(false);
          }
          return;
        }

        // Non-abort init errors: reset UI state but don't destroy the session.
        // The session token in storage is likely still valid — the error was a
        // transient network/DB failure during RBAC resolution. Let the user stay
        // logged in; the next page action will re-try RBAC resolution.
        console.error('[AUTH] initAuth non-abort failure; resetting UI without signing out:', e);
        resetState();
        setLoading(false);
      }
    };

    initAuth();

    // Safety net: if loading is still true after 8 seconds, something silently
    // failed. Clear it so the user isn't permanently locked on a spinner.
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[AUTH] loading timeout hit — force-clearing loading state');
        setLoading(false);
      }
    }, 8000);

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AUTH] state changed', { event, email: session?.user?.email || null });

        if (event === 'SIGNED_IN') {
          if (!session?.user) return;
          // Don't set loading:true here — the listener fires after initial mount,
          // and blocking the UI on every SIGNED_IN (including page-refresh replays)
          // causes flicker. initAuth already handles the initial loading state.
          try {
            await fetchUserProfile(session.user);
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('[AUTHZ] fetchUserProfile failed on SIGNED_IN:', e);
            }
          } finally {
            if (mounted) setLoading(false);
          }
          return;
        }

        if (event === 'INITIAL_SESSION') {
          // Tab focus session restore — session is valid, user already loaded.
          // Never set loading:true here — it will freeze the UI if anything
          // async fails. Just silently update the user token metadata.
          if (session?.user) {
            setUser(session.user);
          } else if (!session) {
            resetState();
            // loading stays false — user is already on a page, don't block them
          }
          return;
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token rotation does NOT change the user's role/profile.
          // Just update the user object (for fresh access token metadata)
          // without re-running RBAC queries.
          if (session?.user) {
            console.log('[AUTH] token refreshed, keeping existing RBAC state');
            setUser(session.user);
            // Tell other tabs the token refreshed so they don't re-request
            authChannel?.postMessage({ type: 'TOKEN_REFRESHED', userId: session.user.id });
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          // Supabase fires SIGNED_OUT spuriously when a background token refresh
          // fails (network timeout, lock contention). Verify the session is truly
          // gone before wiping React state — if the token is still in localStorage,
          // this was a false alarm and React state should be re-hydrated, not cleared.
          supabase.auth.getSession().then(({ data }) => {
            if (!mounted) return;
            if (data?.session) {
              // Session still valid — spurious SIGNED_OUT, re-hydrate state
              console.warn('[AUTH] spurious SIGNED_OUT — session still valid, re-hydrating');
              fetchUserProfile(data.session.user).catch(e =>
                console.error('[AUTH] re-hydration after spurious SIGNED_OUT failed:', e)
              );
            } else {
              // Genuinely signed out — clear state
              console.log('[AUTH] confirmed SIGNED_OUT — clearing state');
              resetState();
              setLoading(false);
            }
          }).catch(() => {
            // getSession() itself failed — treat as genuine sign-out
            resetState();
            setLoading(false);
          });
          return;
        }
      }
    );

    // NOTE: No visibilitychange handler here. The Supabase client automatically
    // refreshes expired tokens on each API call (via its internal lock mechanism).
    // Adding a manual getSession() on tab focus causes lock contention with React
    // Query's refetchOnWindowFocus refetches, which also trigger getSession()
    // internally — leading to queries hanging or failing on tab restore.
    // True session expiry is handled by the QueryCache error handler in App.jsx.

    return () => {
      mounted = false;
      subscription.unsubscribe();
      clearTimeout(loadingTimeout);
    };
  }, []);

  // Listen for token refresh broadcasts from other tabs.
  // When another tab successfully refreshes the token, we re-read the session
  // from storage instead of making a new network request (avoiding the race).
  useEffect(() => {
    if (!authChannel) return;
    let mounted = true;
    const handler = (event) => {
      if (event.data?.type === 'TOKEN_REFRESHED') {
        // Another tab already refreshed — just re-read session from storage
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session?.user && mounted) {
            console.log('[AUTH] token refreshed by another tab, updating session');
            setUser(data.session.user);
          }
        });
      }
    };
    authChannel.addEventListener('message', handler);
    return () => {
      mounted = false;
      authChannel.removeEventListener('message', handler);
    };
  }, []);

  // Sign out function
  const signOut = async () => {
    try {
      // End impersonation if active
      if (isImpersonating) {
        await endImpersonation();
      }
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      // Continue anyway — cleanup runs in finally
    } finally {
      // Always clear local state, even if signOut failed
      localStorage.removeItem('currentAgencyId');
      clearSupabaseAuthTokenFromStorage();
      resetState();
    }
  };

  // Hard-reset session: clears corrupted Supabase token + signs out + reloads
  // Exposes the manual "localStorage.clear()" workaround as a safe UI action.
  const resetSession = async () => {
    try {
      clearSupabaseAuthTokenFromStorage();
      localStorage.removeItem('currentAgencyId');
      try { await supabase.auth.signOut(); } catch (_) {}
      resetState();
      window.location.reload();
    } catch (error) {
      console.error('Error resetting session:', error);
      // Last resort: full reload anyway
      window.location.reload();
    }
  };

  // Refresh user data
  const refreshUser = async () => {
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      await fetchUserProfile(currentUser);
    }
  };

  // Set current agency context
  const setCurrentAgency = useCallback((agencyId) => {
    const membership = agencyMemberships.find(m => m.agency_id === agencyId);
    if (membership) {
      setCurrentAgencyId(agencyId);
      setCurrentAgencyRole(membership.agency_role);
      localStorage.setItem('currentAgencyId', agencyId);
    }
  }, [agencyMemberships]);

  // Start impersonation session (platform admin only)
  const startImpersonation = async (targetUserId, reason, actionsEnabled = false) => {
    if (!isPlatformUser || !hasPlatformRole('platform_admin')) {
      throw new Error('Only platform admins can impersonate users');
    }

    try {
      const { data, error } = await supabase
        .rpc('start_impersonation', {
          p_target_user_id: targetUserId,
          p_reason: reason,
          p_actions_enabled: actionsEnabled
        });

      if (error) throw error;

      // Refresh to load impersonation context
      await refreshUser();
      return data;
    } catch (error) {
      console.error('Error starting impersonation:', error);
      throw error;
    }
  };

  // End impersonation session
  const endImpersonation = async () => {
    try {
      const { data, error } = await supabase
        .rpc('end_impersonation', {
          p_session_id: impersonationSession?.id || null
        });

      if (error) throw error;

      setIsImpersonating(false);
      setImpersonationSession(null);
      await refreshUser();
      return data;
    } catch (error) {
      console.error('Error ending impersonation:', error);
      throw error;
    }
  };

  // Derived state: active plane
  // Platform users always get platform plane (they access agency data through admin view)
  // Non-platform users with agency memberships get agency plane
  // Everyone else gets consumer plane
  const resolvedPlane = useMemo(() => {
    if (isPlatformUser && platformRole) return 'platform';
    if (agencyMemberships.length > 0) return 'agency';
    return 'consumer';
  }, [isPlatformUser, platformRole, agencyMemberships]);

  // Cache the resolved plane after RBAC loads, so refreshes don't flash consumer nav
  useEffect(() => {
    if (!loading && user) {
      try { sessionStorage.setItem('qs_active_plane', resolvedPlane); } catch (_) {}
    }
    if (!loading && !user) {
      try { sessionStorage.removeItem('qs_active_plane'); } catch (_) {}
    }
  }, [resolvedPlane, loading, user]);

  // While RBAC is loading, use the cached plane from the previous session.
  // This prevents Layout from flashing consumer nav for admin users on refresh.
  const activePlane = useMemo(() => {
    if (!loading) return resolvedPlane;
    try { return sessionStorage.getItem('qs_active_plane') || 'consumer'; }
    catch (_) { return 'consumer'; }
  }, [loading, resolvedPlane]);

  // Helper: Check platform role
  const hasPlatformRole = useCallback((requiredRole) => {
    if (!isPlatformUser || !platformRole) return false;
    const userLevel = PLATFORM_ROLE_HIERARCHY[platformRole] || 0;
    const requiredLevel = PLATFORM_ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }, [isPlatformUser, platformRole]);

  // Helper: Check agency role for current agency
  const hasAgencyRole = useCallback((requiredRole, agencyId = currentAgencyId) => {
    if (!agencyId) return false;
    const membership = agencyMemberships.find(m => m.agency_id === agencyId);
    if (!membership || membership.status !== 'active') return false;

    const userLevel = AGENCY_ROLE_HIERARCHY[membership.agency_role] || 0;
    const requiredLevel = AGENCY_ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }, [agencyMemberships, currentAgencyId]);

  const value = {
    // User info
    user,
    profile,
    role, // Legacy
    // Two-plane RBAC
    activePlane,
    isPlatformUser,
    platformRole,
    agencyMemberships,
    currentAgencyId,
    currentAgencyRole,
    // Impersonation
    isImpersonating,
    impersonationSession,
    // State
    loading,
    authError,
    // Actions
    signOut,
    resetSession,
    refreshUser,
    setCurrentAgency,
    startImpersonation,
    endImpersonation,
    // Permission helpers
    hasPlatformRole,
    hasAgencyRole,
    // Constants for external use
    PLATFORM_ROLE_HIERARCHY,
    AGENCY_ROLE_HIERARCHY
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
