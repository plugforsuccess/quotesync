// src/contexts/AuthContext.jsx
// Global authentication context with two-plane RBAC support
// Platform plane: internal staff (platform_master_admin, platform_admin, platform_support, platform_editor, platform_auditor)
// Tenant plane: agency users (agent, manager, producer, viewer)

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';

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

// Supabase stores under: sb-<project-ref>-auth-token
function clearSupabaseAuthTokenFromStorage() {
  try {
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
          await sleep(200);
          if (!mounted) return;
          try {
            const { data } = await safeGetSession(1);
            if (data?.session?.user) {
              await fetchUserProfile(data.session.user);
            } else {
              resetState();
            }
          } catch (e2) {
            console.warn('[AUTH] init retry failed; resetting session storage', e2);
            // Hard reset only Supabase token (not all localStorage)
            clearSupabaseAuthTokenFromStorage();
            try { await supabase.auth.signOut(); } catch (_) {}
            resetState();
          } finally {
            if (mounted) setLoading(false);
          }
          return;
        }

        // Non-abort init errors: clear only Supabase token + sign out
        // to avoid "bricked" loops from corrupted stored session
        clearSupabaseAuthTokenFromStorage();
        try { await supabase.auth.signOut(); } catch (_) {}
        resetState();
        setLoading(false);
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AUTH] state changed', { event, email: session?.user?.email || null });

        if (event === 'SIGNED_IN') {
          // Full RBAC resolution only on initial sign-in
          if (!session?.user) return;
          setLoading(true);
          try {
            await fetchUserProfile(session.user);
          } catch (e) {
            if (!isAbortError(e)) {
              console.error('[AUTHZ] fetchUserProfile failed on sign-in:', e);
            }
          } finally {
            if (mounted) setLoading(false);
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
          }
          return;
        }

        if (event === 'SIGNED_OUT') {
          resetState();
          // Ensure loading is false so ProtectedRoute evaluates and redirects
          setLoading(false);
          return;
        }
      }
    );

    // Proactive session check on tab/app focus.
    // When the user returns to the tab, validate the session BEFORE React Query
    // fires refetches. This prevents cascading 401 errors from stale tokens.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && mounted) {
        supabase.auth.getSession().then(({ data, error }) => {
          if (!mounted) return;
          if (error) {
            // Transient error (network blip, lock contention) — do NOT sign out.
            // The token may still be valid; signing out here causes the
            // "session lost on tab switch" bug.
            console.warn('[AUTH] getSession error on tab focus (ignoring):', error.message);
            return;
          }
          if (!data?.session) {
            console.log('[AUTH] session expired while tab was hidden');
            resetState();
            setLoading(false);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
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
  const activePlane = useMemo(() => {
    if (isPlatformUser && platformRole) return 'platform';
    if (agencyMemberships.length > 0) return 'agency';
    return 'consumer';
  }, [isPlatformUser, platformRole, agencyMemberships]);

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
