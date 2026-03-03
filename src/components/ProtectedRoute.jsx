// src/components/ProtectedRoute.jsx
// Route protection component with two-plane RBAC support
// Supports both platform roles and agency roles

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { hasPermission } from '../lib/supabase';

/**
 * ProtectedRoute component for two-plane RBAC
 *
 * Props:
 * - requiredRole: Legacy role check (editor, admin) - for backward compatibility
 * - requiredPlatformRole: Platform plane role (platform_editor, platform_admin, etc.)
 * - requiredAgencyRole: Agency plane role (viewer, producer, manager, agent)
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
    isPlatformUser,
    hasPlatformRole,
    hasAgencyRole,
    agencyMemberships
  } = useAuth();

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Must be authenticated
  if (!user) {
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
