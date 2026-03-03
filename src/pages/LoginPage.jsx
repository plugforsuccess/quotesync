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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(56, 189, 148, 0.03) 0%, transparent 50%), linear-gradient(135deg, #0f1117 0%, #1a1d28 50%, #0f1117 100%)'
      }}
    >
      <div
        className="w-full max-w-md rounded-2xl p-8"
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Logo — matches global header */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center flex-shrink-0 shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-gray-100 to-white bg-clip-text text-transparent">
              insuredbycam
            </span>
          </div>
          <p className="text-sm text-gray-400">Agency Admin Portal</p>
        </div>

        <div className="text-center mb-6">
          <h2 className="text-xl font-semibold text-white">
            {mode === 'login' ? 'Sign In' : 'Reset Password'}
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            {mode === 'login' ? 'Access your dashboard' : 'Enter your email to receive a reset link'}
          </p>
        </div>

        {existingSession && mode === 'login' && (
          <div className="bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-4 py-3 rounded-lg text-sm mb-6">
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
              className="underline font-semibold hover:text-emerald-200"
            >
              go to dashboard
            </button>{' '}
            or log in as a different user below.
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/40 text-red-300 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}

        {resetSuccess && (
          <div className="bg-emerald-900/30 border border-emerald-700/40 text-emerald-300 px-4 py-3 rounded-lg text-sm mb-6">
            {resetSuccess}
          </div>
        )}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-gray-500"
                placeholder="admin@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-gray-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => { setMode('reset'); setError(''); setResetSuccess(''); }}
                className="text-sm text-emerald-400 hover:text-emerald-300 mt-2"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-white placeholder-gray-500"
                placeholder="admin@example.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setResetSuccess(''); }}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                Back to Sign In
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 text-center text-xs text-gray-500 space-y-2">
          <p className="border-t border-white/10 pt-4">
            <strong className="text-gray-400">Tip:</strong> If login fails, disable ad blockers or privacy extensions for this site.
          </p>
          <p>&copy; {new Date().getFullYear()} InsuredByCam</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
