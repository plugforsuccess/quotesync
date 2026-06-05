// src/pages/LoginPage.jsx
// Login page for platform staff and agency users

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useForceTheme } from '../contexts/ThemeContext';
import { getDefaultLanding } from '../config/navConfig';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';

const LoginPage = () => {
  // Login page is designed dark — force dark for all users regardless of
  // their saved theme preference. Preference is restored once they navigate
  // into an authenticated Layout.
  useForceTheme('dark');

  const navigate = useNavigate();
  const { user, loading: authLoading, currentAgencyId, platformRole, currentAgencyRole, isPlatformUser } = useAuth();
  // Only query for employee record if the user is not a platform user — avoids
  // an unnecessary DB round trip on every platform admin login.
  const { data: employeeRecord, isLoading: empLoading } = useCurrentEmployee();
  const empResolved = isPlatformUser || !!currentAgencyRole || !empLoading;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('login');
  const [resetSuccess, setResetSuccess] = useState('');

  // If user is already authenticated (or becomes authenticated after login),
  // redirect to the appropriate landing page. This replaces both the old
  // checkSession useEffect and the post-login navigation in handleLogin.
  // Employees (non-platform users) go to /my/queue; platform/agency users
  // go to their role-based landing page.
  useEffect(() => {
    if (!authLoading && empResolved && user) {
      // Employee (not platform admin, not principal/manager/producer) →
      // send to their queue. 'producer' is treated as an agency member so
      // they land via getDefaultLanding; only the new 'employee' agency
      // role falls through to /my/queue.
      const isAgencyMember = currentAgencyRole === 'principal'
        || currentAgencyRole === 'manager'
        || currentAgencyRole === 'producer';
      if (employeeRecord && !isPlatformUser && !isAgencyMember) {
        // Sales-only employees have no retention queue — land them on their
        // scorecard (the production goal home); service employees keep /my/queue.
        const empRoles = employeeRecord.roles || [];
        const isServiceEmp = empRoles.includes('service_inbound')
          || empRoles.includes('service_outbound')
          || empRoles.includes('service');
        const salesOnly = empRoles.includes('sales') && !isServiceEmp;
        navigate(salesOnly ? '/my/scorecard' : '/my/today', { replace: true });
      } else {
        const agencyRoleVal = currentAgencyId ? currentAgencyRole : null;
        navigate(getDefaultLanding(platformRole, agencyRoleVal), { replace: true });
      }
    }
  }, [authLoading, empResolved, user, employeeRecord, isPlatformUser, platformRole, currentAgencyRole, currentAgencyId, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      if (!data?.session?.user?.id) {
        throw new Error('No session returned. Please try again.');
      }

      setVerifying(true);
      // AuthContext SIGNED_IN handler takes it from here — don't call resolveAuthz
    } catch (error) {
      if (error.message?.includes('Failed to fetch') || error.message?.includes('network')) {
        setError('Network error: check your connection or disable ad blockers.');
      } else {
        setError(error.message || 'Login failed. Please try again.');
      }
      setLoading(false);
      setVerifying(false);
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

  if (verifying) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{
          backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(56, 189, 148, 0.03) 0%, transparent 50%), linear-gradient(135deg, #0f1117 0%, #1a1d28 50%, #0f1117 100%)'
        }}
      >
        {/* Logo mark with spinning ring */}
        <div className="relative mb-8">
          <div
            className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl flex items-center justify-center"
            style={{ boxShadow: '0 0 40px rgba(16, 185, 129, 0.2)' }}
          >
            <svg className="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          {/* Spinning ring — uses --qs-success token */}
          <div
            className="absolute inset-0 rounded-2xl animate-spin"
            style={{
              border: '2px solid transparent',
              borderTopColor: 'var(--qs-success)',
              borderRightColor: 'rgba(16, 185, 129, 0.2)',
              animationDuration: '1.2s'
            }}
          />
        </div>

        {/* Text — uses --qs-bright and --qs-dim tokens */}
        <p className="font-semibold text-lg mb-2" style={{ color: 'var(--qs-bright)' }}>
          Verifying your account
        </p>
        <p className="text-sm" style={{ color: 'var(--qs-dim)' }}>
          Setting up your workspace…
        </p>

        {/* Three-dot pulse — uses --qs-success token */}
        <div className="flex gap-1.5 mt-6">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{
                backgroundColor: 'var(--qs-success)',
                animation: 'pulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.2}s`,
                opacity: 0.7
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(56, 189, 148, 0.03) 0%, transparent 50%), linear-gradient(135deg, #0f1117 0%, #1a1d28 50%, #0f1117 100%)'
      }}
    >
      <div
        className="w-full max-w-md rounded-xl p-8"
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
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign In'}
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
