// src/pages/LoginPage.jsx
// Login page for platform staff and agency users

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, getUserProfile } from '../lib/supabase';
import { getDefaultLanding } from '../config/nav.config';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingSession, setExistingSession] = useState(false);
  const [mode, setMode] = useState('login');
  const [resetSuccess, setResetSuccess] = useState('');

  const resolveAuthz = useCallback(async (userId) => {
    try {
      const result = await getUserProfile(userId);
      const platformRole = result.platformRole;
      const activeMemberships = (result.agencyMemberships || []).filter(
        m => m.status === 'active' && m.agencies?.status === 'approved'
      );
      const agencyRole = activeMemberships.length > 0
        ? activeMemberships[0].agency_role
        : null;

      return {
        status: 'ok',
        derived: {
          platformRole,
          agencyRole,
          landingPath: getDefaultLanding(platformRole, agencyRole)
        }
      };
    } catch (err) {
      return {
        status: 'error',
        error: err
      };
    }
  }, []);

  // Check if already logged in on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        // Show message if already logged in, but don't auto-redirect
        if (session?.user && !error) {
          console.log('[LoginPage] Existing session detected');
          setExistingSession(true);
        }
      } catch (error) {
        console.error('[LoginPage] Error checking session:', error);
      }
    };

    checkSession();
  }, []);

  // Listen for auth changes and only re-resolve on stable auth events.
  // Initial login routing is handled directly by handleLogin for deterministic behavior.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('[LoginPage] Auth event:', event, session?.user?.email);

      if (event === 'SIGNED_OUT') {
        setExistingSession(false);
        return;
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        const authz = await resolveAuthz(session.user.id);
        if (authz.status === 'ok') {
          setExistingSession(true);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resolveAuthz]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('[LoginPage] Attempting login...');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[LoginPage] Login error:', error);
        throw error;
      }

      if (!data?.session?.user?.id) {
        throw new Error('No session returned from sign in. Please try again.');
      }

      const authz = await resolveAuthz(data.session.user.id);
      if (authz.status === 'error') {
        throw authz.error || new Error('Failed to resolve permissions after sign in.');
      }

      console.log('[LoginPage] Login successful, navigating to:', authz.derived.landingPath);
      navigate(authz.derived.landingPath);
    } catch (error) {
      console.error('[LoginPage] Login failed:', error);

      // Check if it's a network error (could be ad blocker)
      if (error.message?.includes('Failed to fetch') || error.message?.includes('network')) {
        setError('Network error: Please check your internet connection or disable ad blockers/extensions that may be blocking Supabase.');
      } else {
        setError(error.message || 'Login failed. Please try again.');
      }

      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetSuccess('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin-access-8by2X`
      });

      if (error) throw error;

      setResetSuccess('Check your email for a password reset link.');
    } catch (error) {
      setError(error.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {mode === 'login' ? 'Sign In' : 'Reset Password'}
          </h1>
          <p className="text-gray-600">
            {mode === 'login' ? 'Access your dashboard' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {existingSession && mode === 'login' && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm mb-6">
            <strong>Already logged in.</strong> You can{' '}
            <button
              type="button"
              onClick={async () => {
                try {
                  const result = await getUserProfile();
                  const platformRole = result.platformRole;
                  const activeMemberships = (result.agencyMemberships || []).filter(
                    m => m.status === 'active' && m.agencies?.status === 'approved'
                  );
                  const agencyRole = activeMemberships.length > 0
                    ? activeMemberships[0].agency_role
                    : null;
                  navigate(getDefaultLanding(platformRole, agencyRole));
                } catch {
                  navigate('/');
                }
              }}
              className="underline font-semibold hover:text-blue-900"
            >
              go to dashboard
            </button>{' '}
            or log in as a different user below.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm mb-6">
            {error}
          </div>
        )}

        {resetSuccess && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm mb-6">
            {resetSuccess}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setResetSuccess(''); }}
                className="text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-gray-900"
                placeholder="admin@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setResetSuccess(''); }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center text-xs text-gray-500 space-y-2">
          <p>First time? Create a user in Supabase dashboard first.</p>
          <p className="border-t border-gray-200 pt-2">
            <strong>Tip:</strong> If login fails, disable ad blockers or privacy extensions for this site.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
