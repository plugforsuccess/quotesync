// src/lib/supabase.js
// Supabase client configuration for QuoteSync with two-plane RBAC support

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials not found. Features will not work.');
  console.warn('Please add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'X-Client-Info': 'quotesync-newsroom'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// =============================================================================
// ROLE HIERARCHIES
// =============================================================================

// Platform roles (internal staff)
export const PLATFORM_ROLE_HIERARCHY = {
  platform_auditor: 1,
  platform_editor: 2,
  platform_support: 3,
  platform_admin: 4,
  platform_master_admin: 5
};

// Agency roles (Allstate terminology: agent = principal, producer = staff)
export const AGENCY_ROLE_HIERARCHY = {
  producer: 1,
  agent: 2
  // Future: viewer: 0, manager: 2
};

// Legacy role hierarchy (for backward compatibility)
const LEGACY_ROLE_HIERARCHY = {
  viewer: 0,
  editor: 1,
  admin: 2
};

// =============================================================================
// PERMISSION FUNCTIONS
// =============================================================================

/**
 * Check if user has permission level (legacy function for backward compatibility)
 * @deprecated Use hasPlatformRole or hasAgencyRole from useAuth instead
 */
export const hasPermission = (userRole, requiredRole) => {
  return LEGACY_ROLE_HIERARCHY[userRole] >= LEGACY_ROLE_HIERARCHY[requiredRole];
};

/**
 * Check if platform role meets minimum requirement
 */
export const hasPlatformPermission = (userPlatformRole, requiredRole) => {
  if (!userPlatformRole) return false;
  const userLevel = PLATFORM_ROLE_HIERARCHY[userPlatformRole] || 0;
  const requiredLevel = PLATFORM_ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

/**
 * Check if agency role meets minimum requirement
 */
export const hasAgencyPermission = (userAgencyRole, requiredRole) => {
  if (!userAgencyRole) return false;
  const userLevel = AGENCY_ROLE_HIERARCHY[userAgencyRole] || 0;
  const requiredLevel = AGENCY_ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

// =============================================================================
// USER PROFILE FUNCTIONS
// =============================================================================

/**
 * Get user profile with full RBAC info
 */
export const getUserProfile = async (userId = null) => {
  const { data: { user }, error: authError } = userId
    ? { data: { user: { id: userId } }, error: null }
    : await supabase.auth.getUser();

  if (authError) {
    console.error('[AUTHZ] auth user fetch failed', authError);
    throw authError;
  }

  if (!user?.id) {
    return {
      user: null,
      profile: null,
      platformRole: null,
      agencyMemberships: []
    };
  }

  const { data: profileData, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, platform_role, is_platform_user')
    .eq('id', user.id)
    .single();

  if (profileError) {
    console.error('[AUTHZ] profile fetch error', { uid: user.id, profileError });
    throw profileError;
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
    .eq('user_id', user.id)
    .eq('status', 'active');

  if (membershipError) {
    console.error('[AUTHZ] membership fetch error', { uid: user.id, membershipError });
    throw membershipError;
  }

  return {
    user,
    profile: profileData,
    platformRole: profileData?.platform_role || null,
    agencyMemberships: memberships || [],
    isPlatformUser: profileData?.is_platform_user || false,
    // Legacy field
    role: profileData?.role || 'viewer'
  };
};

/**
 * @deprecated Use getUserProfile instead
 */
export const getUserRole = async () => {
  const result = await getUserProfile();

  // Bridge: derive effective legacy role from platform_role if available
  let effectiveRole = result.role;
  if (result.isPlatformUser && result.platformRole) {
    if (['platform_admin', 'platform_master_admin'].includes(result.platformRole)) {
      effectiveRole = 'admin';
    } else if (['platform_editor', 'platform_support', 'platform_auditor'].includes(result.platformRole)) {
      effectiveRole = 'editor';
    }
  }

  return {
    user: result.user,
    role: effectiveRole,
    profile: result.profile
  };
};

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Log an admin action to the audit log
 */
export const logAdminAction = async (eventType, agencyId = null, leadId = null, metadata = {}) => {
  try {
    const { data, error } = await supabase.rpc('log_admin_action', {
      p_event_type: eventType,
      p_agency_id: agencyId,
      p_lead_id: leadId,
      p_metadata: metadata
    });

    if (error) {
      console.error('Error logging admin action:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception logging admin action:', error);
    return null;
  }
};

// =============================================================================
// IMPERSONATION FUNCTIONS
// =============================================================================

/**
 * Start an impersonation session
 * @param {string} targetUserId - UUID of the user to impersonate
 * @param {string} reason - Required reason for impersonation
 * @param {boolean} actionsEnabled - Whether write actions are allowed
 */
export const startImpersonation = async (targetUserId, reason, actionsEnabled = false) => {
  const { data, error } = await supabase.rpc('start_impersonation', {
    p_target_user_id: targetUserId,
    p_reason: reason,
    p_actions_enabled: actionsEnabled
  });

  if (error) throw error;
  return data;
};

/**
 * End an impersonation session
 * @param {string} sessionId - Optional session ID (ends current if not specified)
 */
export const endImpersonation = async (sessionId = null) => {
  const { data, error } = await supabase.rpc('end_impersonation', {
    p_session_id: sessionId
  });

  if (error) throw error;
  return data;
};

/**
 * Get impersonation history (platform admin only)
 */
export const getImpersonationHistory = async (limit = 50) => {
  const { data, error } = await supabase
    .from('impersonation_history')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data;
};
