// src/pages/LoginPage.jsx
// Login page for platform staff and agency users

import { T } from '../components/SiteCopy';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useForceTheme } from '../contexts/ThemeContext';
import { getDefaultLanding } from '../config/navConfig';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import BrandLogo, { SealMark } from '../components/BrandLogo';

const LoginPage = () => {
  // Login page is designed dark — force dark for all users regardless of
  // their saved theme preference. Preference is restored once they navigate
  // into an authenticated Layout.
  useForceTheme('light');

  const navigate = useNavigate();
  const { user, loading: authLoading, authzResolved, currentAgencyId, platformRole, currentAgencyRole, isPlatformUser } = useAuth();
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
    // authzResolved gates on role/membership resolution — routing on `user`
    // alone races it and sends real members to the public home page when
    // localStorage has no cached role (e.g. right after clearing site data).
    if (!authLoading && authzResolved && empResolved && user) {
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
  }, [authLoading, authzResolved, empResolved, user, employeeRecord, isPlatformUser, platformRole, currentAgencyRole, currentAgencyId, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Guard against an indefinitely-hanging sign-in (e.g. a stuck auth lock
      // held by a frozen background tab). Without a timeout the button would
      // spin forever; instead we surface a recoverable error after 15s.
      const SIGN_IN_TIMEOUT_MS = 15000;
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({ email, password }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('SIGN_IN_TIMEOUT')),
            SIGN_IN_TIMEOUT_MS
          )
        )
      ]);

      if (error) throw error;

      if (!data?.session?.user?.id) {
        throw new Error('No session returned. Please try again.');
      }

      setVerifying(true);
      // AuthContext SIGNED_IN handler takes it from here — don't call resolveAuthz
    } catch (error) {
      if (error.message === 'SIGN_IN_TIMEOUT') {
        setError('Sign-in timed out. Please try again — if it keeps happening, clear this site’s data in your browser settings and reload.');
      } else if (error.message?.includes('Failed to fetch') || error.message?.includes('network')) {
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

  // Brand look: the agency's blue, a white card, the seal and name, the site's buttons.
  const bg = { background: 'radial-gradient(ellipse at 15% 0%, rgba(96,165,250,0.35) 0%, transparent 55%), linear-gradient(135deg, #1D4ED8 0%, #1E3A8A 55%, #0F2D6B 100%)' };
  const field = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100';
  const linkBtn = 'text-sm font-semibold text-blue-700 hover:underline';

  if (verifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4" style={bg}>
        <div className="relative mb-6">
          <SealMark className="h-16 w-16" />
          <span className="absolute -inset-2 animate-spin rounded-full border-2 border-transparent border-t-[#F5D061]" style={{ animationDuration: '1.2s' }} aria-hidden="true" />
        </div>
        <p className="text-lg font-bold text-white"><T k="pages.loginpage.3c7a3c">Verifying Your Account</T></p>
        <p className="mt-1 text-sm text-blue-100"><T k="pages.loginpage.0b3c07">Setting up your workspace…</T></p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10" style={bg}>
      <div className="mb-8"><BrandLogo size="lg" /></div>
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl shadow-blue-950/30 sm:p-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#0F2D6B]">{mode === 'login' ? <T k="pages.loginpage.f8492c">{'Sign In'}</T> : <T k="pages.loginpage.20553f">{'Reset Your Password'}</T>}</h1>
        <p className="mt-1 text-sm text-slate-500">{mode === 'login' ? <T k="pages.loginpage.97ad22">{'Agency workspace'}</T> : <T k="pages.loginpage.e584f6">{'We’ll email you a link to set a new one.'}</T>}</p>

        {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}
        {resetSuccess && <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status">{resetSuccess}</p>}

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-slate-800"><T k="pages.loginpage.84add5">Email</T></label>
              <input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} placeholder="you@example.com" />
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="login-password" className="block text-sm font-semibold text-slate-800"><T k="pages.loginpage.8be3c9">Password</T></label>
                <button type="button" onClick={() => { setMode('reset'); setError(''); setResetSuccess(''); }} className={linkBtn}><T k="pages.loginpage.1cc8d1">Forgot Password?</T></button>
              </div>
              <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className={field} placeholder="Your password" />
            </div>
            <button type="submit" disabled={loading} className="qb qb-blue qb-lg mt-2 w-full">
              {loading ? (<><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" /> <T k="pages.loginpage.ad53ee">Signing In…</T></>) : <T k="pages.loginpage.f8492c">{'Sign In'}</T>}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="reset-email" className="mb-1.5 block text-sm font-semibold text-slate-800"><T k="pages.loginpage.84add5">Email</T></label>
              <input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={field} placeholder="you@example.com" />
            </div>
            <button type="submit" disabled={loading} className="qb qb-blue qb-lg mt-2 w-full">{loading ? <T k="pages.loginpage.cf7655">{'Sending…'}</T> : <T k="pages.loginpage.987be4">{'Send Reset Link'}</T>}</button>
            <p className="text-center">
              <button type="button" onClick={() => { setMode('login'); setError(''); setResetSuccess(''); }} className={linkBtn}><T k="pages.loginpage.c65048">Back to Sign In</T></button>
            </p>
          </form>
        )}

        <p className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-500"><T k="pages.loginpage.56ca6c">If sign-in fails, turn off ad blockers or privacy extensions for this site.</T></p>
      </div>
      <p className="mt-6 text-xs text-blue-200">© {new Date().getFullYear()} <T k="pages.loginpage.33f5c7">Cam Wiley Agency, Inc.</T></p>
    </div>
  );
};

export default LoginPage;
