// src/hooks/useSessionValidation.js
// Hook to validate Supabase session and handle auth errors

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

/**
 * Hook to validate session on mount and provide session error recovery
 *
 * Returns:
 * - isValid: boolean - whether session is valid
 * - isChecking: boolean - whether validation is in progress
 * - error: string | null - error message if session is invalid
 * - retry: function - retry session validation
 */
export const useSessionValidation = (requiredRole = null) => {
  const [isValid, setIsValid] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const validateSession = useCallback(async () => {
    setIsChecking(true);
    setError(null);

    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[useSessionValidation] Session error:', sessionError);
        setError('Failed to validate session');
        setIsValid(false);
        setIsChecking(false);
        return;
      }

      if (!session) {
        console.warn('[useSessionValidation] No active session');
        setError('No active session. Please log in.');
        setIsValid(false);
        setIsChecking(false);
        return;
      }

      // If role check is required, fetch user profile
      if (requiredRole) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, platform_role, is_platform_user')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          console.error('[useSessionValidation] Profile error:', profileError);
          setError('Failed to verify permissions');
          setIsValid(false);
          setIsChecking(false);
          return;
        }

        const userRole = profile?.role || 'viewer';
        const platformRole = profile?.platform_role;
        const isPlatformUser = profile?.is_platform_user || false;

        // Check if user has required role (legacy OR platform)
        const legacyPermission =
          requiredRole === 'viewer' ||
          (requiredRole === 'editor' && (userRole === 'editor' || userRole === 'admin')) ||
          (requiredRole === 'admin' && userRole === 'admin');

        const platformPermission = isPlatformUser && (
          (requiredRole === 'admin' && ['platform_admin', 'platform_master_admin'].includes(platformRole)) ||
          (requiredRole === 'editor' && ['platform_editor', 'platform_support', 'platform_admin', 'platform_master_admin'].includes(platformRole))
        );

        if (!legacyPermission && !platformPermission) {
          console.warn('[useSessionValidation] Insufficient permissions:', userRole, 'platformRole:', platformRole, 'required:', requiredRole);
          setError(`Access denied. Required role: ${requiredRole}`);
          setIsValid(false);
          setIsChecking(false);
          return;
        }
      }

      // Session is valid
      console.log('[useSessionValidation] Session valid');
      setIsValid(true);
      setError(null);
    } catch (err) {
      console.error('[useSessionValidation] Validation exception:', err);
      setError('Unexpected error during session validation');
      setIsValid(false);
    } finally {
      setIsChecking(false);
    }
  }, [requiredRole]);

  // Validate on mount
  useEffect(() => {
    validateSession();
  }, [validateSession]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[useSessionValidation] Auth state changed:', event);

      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setIsValid(false);
        setError('Session expired. Please log in again.');
      } else if (event === 'TOKEN_REFRESHED') {
        // Token was just refreshed successfully — session is valid.
        // Don't call validateSession() here: it fires getSession() + a profile
        // query, which contends with React Query refetches on tab restore and
        // can cause queries to hang due to Supabase's internal auth lock.
        if (session) {
          setIsValid(true);
          setError(null);
        }
      } else if (event === 'SIGNED_IN') {
        // Full validation on sign-in (role may change)
        validateSession();
      }
    });

    return () => subscription.unsubscribe();
  }, [validateSession]);

  const retry = useCallback(() => {
    validateSession();
  }, [validateSession]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/admin-access-8by2X');
  }, [navigate]);

  return {
    isValid,
    isChecking,
    error,
    retry,
    handleSignOut
  };
};

/**
 * HOC to wrap components with session validation
 */
export const withSessionValidation = (Component, requiredRole = null) => {
  return function SessionValidatedComponent(props) {
    const { isValid, isChecking, error, retry, handleSignOut } = useSessionValidation(requiredRole);

    if (isChecking) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Validating session...</p>
          </div>
        </div>
      );
    }

    if (!isValid || error) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-red-600 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Session Error</h2>
            <p className="text-gray-600 mb-6">{error || 'Your session is invalid or expired.'}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={retry}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
              >
                Retry
              </button>
              <button
                onClick={handleSignOut}
                className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors"
              >
                Sign Out & Log In Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <Component {...props} />;
  };
};
