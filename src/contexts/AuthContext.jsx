// src/contexts/auth-context.jsx
// Global authentication context with two-plane RBAC support
// Platform plane: internal staff (platform_master_admin, platform_admin, platform_support, platform_editor, platform_auditor)
// Tenant plane: agency users (agent, manager, producer, viewer)

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext, PLATFORM_ROLE_HIERARCHY, AGENCY_ROLE_HIERARCHY } from './auth-context';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState('viewer'); // Legacy
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

  const resetState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setRole('viewer');
    setIsPlatformUser(false);
    setPlatformRole(null);
    setAgencyMemberships([]);
    setCurrentAgencyId(null);
    setCurrentAgencyRole(null);
    setIsImpersonating(false);
    setImpersonationSession(null);
    setAuthError(null);
  }, []);

  // Fetch user profile and memberships
  const fetchUserProfile = useCallback(async (currentUser) => {
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
      setUser(currentUser);
      setProfile(null);
      setRole('viewer');
      setIsPlatformUser(false);
      setPlatformRole(null);
      setAgencyMemberships([]);
      setCurrentAgencyId(null);
      setCurrentAgencyRole(null);
      setIsImpersonating(false);
      setImpersonationSession(null);
      setAuthError({
        code: 'AUTHZ_RESOLUTION_FAILED',
        message: "We couldn't load your permissions. Please retry.",
        timestamp: new Date().toISOString(),
        details: error?.message || 'Unknown error'
      });
    }
  }, [resetState]);

  // Initialize auth state on mount
  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (mounted) {
          console.log('[AUTH] session loaded', { hasSession: !!session, uid: session?.user?.id || null });
          if (session?.user) {
            await fetchUserProfile(session.user);
          } else {
            resetState();
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        console.log('[AUTH] state changed', { event, email: session?.user?.email || null });

        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.user) {
            setLoading(true);
            await fetchUserProfile(session.user);
            setLoading(false);
          }
        } else if (event === 'SIGNED_OUT') {
          resetState();
        }

        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile, resetState]);

  // Sign out function
  const signOut = async () => {
    try {
      // End impersonation if active
      if (isImpersonating) {
        await endImpersonation();
      }
      await supabase.auth.signOut();
      localStorage.removeItem('currentAgencyId');
      resetState();
    } catch (error) {
      console.error('Error signing out:', error);
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
