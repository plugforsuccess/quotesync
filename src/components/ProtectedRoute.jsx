// src/components/ProtectedRoute.jsx
// Route protection component with two-plane RBAC support
// Supports both platform roles and agency roles

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../lib/supabase';
import PageSpinner from './PageSpinner';

/**
 * ProtectedRoute component for two-plane RBAC
 *
 * Props:
 * - requiredRole: Legacy role check (editor, admin) - for backward compatibility
 * - requiredPlatformRole: Platform plane role (platform_editor, platform_admin, etc.)
 * - requiredAgencyRole: Agency plane role (producer, manager, principal)
 * - requirePlatformUser: If true, only platform users can access
 * - requireAgencyMembership: If true, user must have at least one active agency
 * - redirectTo: Where to redirect on access denied (default: login page)
 */
const ProtectedRoute = ({
  children,
  requiredRole = null,
  requiredPlatformRole = null,
  requiredAgencyRole = null,
  requirePlatformUser = false,
  requireAgencyMembership = false,
  redirectTo = '/admin-access-8by2X'
}) => {
  const {
    user,
    role,
    loading,
    authError,
    isPlatformUser,
    hasPlatformRole,
    hasAgencyRole,
    agencyMemberships
  } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return <PageSpinner />;
  }

  // RBAC resolution error: fail closed with visible error state
  if (authError) {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-red-700 mb-2">Permissions could not be loaded</h2>
          <p className="text-sm text-gray-700 mb-4">We couldn't load your permissions. Please retry.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Must be authenticated
  if (!user) {
    // Before redirecting to login, check if the Supabase session token still
    // exists in localStorage. If it does, React state is temporarily wrong
    // (spurious SIGNED_OUT) and AuthContext will re-hydrate shortly.
    // Show a spinner instead of booting the user to the login page.
    try {
      const tokenKey = Object.keys(localStorage).find(
        k => k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      if (tokenKey) {
        const raw = localStorage.getItem(tokenKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const expiresAt = parsed?.expires_at; // Unix timestamp in seconds
        const isStillValid = expiresAt && (expiresAt * 1000) > Date.now();
        if (isStillValid) {
          // Token exists and hasn't expired — React state is temporarily wrong,
          // AuthContext will re-hydrate shortly. Show spinner.
          return <PageSpinner />;
        }
        // Token exists but is expired — fall through to login redirect.
      }
    } catch (_) {
      // localStorage unavailable or JSON parse failed — fall through to redirect
    }
    return <Navigate to={redirectTo} replace />;
  }

  // Check platform user requirement
  if (requirePlatformUser && !isPlatformUser) {
    return <Navigate to="/unauthorized" replace state={{ reason: 'platform_only' }} />;
  }

  // Check agency membership requirement
  if (requireAgencyMembership) {
    const activeMemberships = agencyMemberships.filter(m => m.status === 'active');
    if (activeMemberships.length === 0) {
      return <Navigate to="/no-agency" replace />;
    }
  }

  // Check platform role requirement
  if (requiredPlatformRole) {
    if (!isPlatformUser || !hasPlatformRole(requiredPlatformRole)) {
      return <Navigate to="/unauthorized" replace state={{ reason: 'insufficient_platform_role' }} />;
    }
  }

  // Check agency role requirement
  if (requiredAgencyRole) {
    if (!hasAgencyRole(requiredAgencyRole)) {
      return <Navigate to="/unauthorized" replace state={{ reason: 'insufficient_agency_role' }} />;
    }
  }

  // Legacy role check (for backward compatibility)
  // FIXED: Platform users with sufficient platform_role bypass legacy check
  if (requiredRole && !hasPermission(role, requiredRole)) {
    // Bridge: platform roles map to legacy roles
    const platformGrantsAccess = isPlatformUser && (
      // platform_admin and above satisfy any legacy requiredRole
      (hasPlatformRole('platform_admin')) ||
      // platform_editor satisfies requiredRole="editor"
      (requiredRole === 'editor' && hasPlatformRole('platform_editor'))
    );

    if (!platformGrantsAccess) {
      // Also allow agency users to access routes they have agency-level permission for
      const hasAgencyAccess = agencyMemberships.some(m => m.status === 'active');
      if (!hasAgencyAccess) {
        return <Navigate to={redirectTo} replace />;
      }
    }
  }

  // Render protected content
  return children;
};

/**
 * Higher-order component for platform-only routes
 */
export const PlatformRoute = ({ children, requiredRole, ...props }) => (
  <ProtectedRoute
    requirePlatformUser
    requiredPlatformRole={requiredRole}
    {...props}
  >
    {children}
  </ProtectedRoute>
);

/**
 * Higher-order component for agency-only routes
 */
export const AgencyRoute = ({ children, requiredRole, ...props }) => (
  <ProtectedRoute
    requireAgencyMembership
    requiredAgencyRole={requiredRole}
    {...props}
  >
    {children}
  </ProtectedRoute>
);

export default ProtectedRoute;
