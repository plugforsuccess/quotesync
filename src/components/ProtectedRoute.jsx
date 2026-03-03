// src/components/ProtectedRoute.jsx
// Route protection component with two-plane RBAC support
// Supports both platform roles and agency roles

import { useState } from 'react';
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
    authError,
    isPlatformUser,
    hasPlatformRole,
    hasAgencyRole,
    agencyMemberships,
    refreshUser,
    resetSession
  } = useAuth();

  const [retrying, setRetrying] = useState(false);

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

  // RBAC resolution error: fail closed with actionable recovery options
  if (authError) {
    const handleRetry = async () => {
      setRetrying(true);
      try {
        await refreshUser();
      } catch (_) {
        // refreshUser failure is already captured in authError by AuthContext
      } finally {
        setRetrying(false);
      }
    };

    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-red-700 mb-2">
            Permissions could not be loaded
          </h2>
          <p className="text-sm text-gray-700 mb-4">
            {authError.message || "We couldn't verify your access. Please retry or reset your session."}
          </p>

          {authError.details && (
            <details className="mb-4 text-xs text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">
                Technical details
              </summary>
              <pre className="mt-1 p-2 bg-gray-50 rounded overflow-auto max-h-24">
                {authError.details}
              </pre>
            </details>
          )}

          <div className="flex gap-3">
            {authError.canRetry !== false && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                {retrying ? 'Retrying\u2026' : 'Retry'}
              </button>
            )}
            {authError.canReset !== false && (
              <button
                type="button"
                onClick={resetSession}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm font-medium transition-colors"
              >
                Reset Session
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Must be authenticated
  if (!user) {
    return <Navigate to={redirectTo} replace />;
  }

  // Defensive: if role is null (RBAC didn't resolve but no authError was set),
  // fail closed rather than letting undefined behavior through hasPermission.
  // This should not normally happen — authError gate above should catch it —
  // but guards against edge cases like state update ordering.
  if (role === null && (requiredRole || requiredPlatformRole || requiredAgencyRole)) {
    console.warn('[ProtectedRoute] role is null without authError — failing closed');
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-lg shadow-sm p-6 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3"></div>
          <p className="text-sm text-gray-600">Verifying permissions…</p>
        </div>
      </div>
    );
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
