// src/pages/LoginPage.jsx
// Login page with TOTP MFA support (Google Authenticator)

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getDefaultLanding } from '../config/nav.config';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, currentAgencyId, platformRole, currentAgencyRole } = useAuth();

  // Step: 'credentials' | 'mfa_verify' | 'mfa_enroll'
  const [step,         setStep]         = useState('credentials');
  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [code,         setCode]         = useState('');
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [mode,         setMode]         = useState('login'); // 'login' | 'reset'
  const [resetSuccess, setResetSuccess] = useState('');

  // MFA enroll state
  const [enrollData,   setEnrollData]   = useState(null); // { id, qrCode, secret }
  const [factorId,     setFactorId]     = useState(null); // for verify step
  const [challengeId,  setChallengeId]  = useState(null);

  const codeInputRef = useRef(null);

  // MFA redirect message from ProtectedRoute
  const mfaMessage = location.state?.message;

  // Already authenticated → redirect
  useEffect(() => {
    if (!authLoading && user) {
      const agencyRoleVal = currentAgencyId ? currentAgencyRole : null;
      navigate(getDefaultLanding(platformRole, agencyRoleVal), { replace: true });
    }
  }, [authLoading, user, platformRole, currentAgencyRole, currentAgencyId, navigate]);

  // Focus code input when step changes to MFA
  useEffect(() => {
    if ((step === 'mfa_verify' || step === 'mfa_enroll') && codeInputRef.current) {
      setTimeout(() => codeInputRef.current?.focus(), 100);
    }
  }, [step]);

  // ── Step 1: Password login ──────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (!data?.session?.user?.id) throw new Error('No session returned. Please try again.');

      // Check MFA status
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

      if (aal?.nextLevel === 'aal2' && aal?.currentLevel === 'aal1') {
        // User has a factor enrolled — needs to verify it
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totpFactor = factors?.totp?.[0];
        if (!totpFactor) throw new Error('MFA factor not found. Contact your administrator.');

        // Create challenge
        const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
          factorId: totpFactor.id,
        });
        if (chalErr) throw chalErr;

        setFactorId(totpFactor.id);
        setChallengeId(challenge.id);
        setStep('mfa_verify');
      } else if (aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal1') {
        // No factor enrolled — force enrollment
        const { data: enroll, error: enrollErr } = await supabase.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: 'Google Authenticator',
        });
        if (enrollErr) throw enrollErr;

        setEnrollData({
          id:     enroll.id,
          qrCode: enroll.totp.qr_code,
          secret: enroll.totp.secret,
        });
        setStep('mfa_enroll');
      } else {
        // aal2 already satisfied — AuthContext SIGNED_IN handler takes it from here
      }
    } catch (err) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('network')) {
        setError('Network error: check your connection or disable ad blockers.');
      } else {
        setError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2a: Verify existing factor ────────────────────────────────────────
  const handleVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6) return;
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code: code.trim(),
      });
      if (error) throw error;
      // AuthContext picks up the upgraded session automatically
    } catch (err) {
      setError(err.message?.includes('Invalid')
        ? 'Incorrect code. Check Google Authenticator and try again.'
        : err.message || 'Verification failed.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2b: Verify newly enrolled factor ──────────────────────────────────
  const handleEnrollVerify = async (e) => {
    e.preventDefault();
    if (code.length !== 6 || !enrollData) return;
    setLoading(true);
    setError('');

    try {
      // Create challenge for the newly enrolled factor
      const { data: challenge, error: chalErr } = await supabase.auth.mfa.challenge({
        factorId: enrollData.id,
      });
      if (chalErr) throw chalErr;

      const { error } = await supabase.auth.mfa.verify({
        factorId:    enrollData.id,
        challengeId: challenge.id,
        code:        code.trim(),
      });
      if (error) throw error;
      // Session upgraded to aal2 — AuthContext useEffect redirects
    } catch (err) {
      setError(err.message?.includes('Invalid')
        ? 'Incorrect code. Make sure you scanned the QR code and entered the current 6-digit code.'
        : err.message || 'Enrollment failed.');
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  // ── Password reset ──────────────────────────────────────────────────────────
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResetSuccess('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/admin-access-8by2X`,
      });
      if (error) throw error;
      setResetSuccess('Check your email for a password reset link.');
    } catch (err) {
      setError(err.message || 'Failed to send reset link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Shared shell ───────────────────────────────────────────────────────────
  const Shell = ({ children, title, subtitle }) => (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(56, 189, 148, 0.03) 0%, transparent 50%), linear-gradient(135deg, #0f1117 0%, #1a1d28 50%, #0f1117 100%)' }}>
      <div className="w-full max-w-md rounded-xl p-8"
        style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
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
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="text-gray-400 text-sm mt-1">{subtitle}</p>
        </div>
        {error && (
          <div className="bg-red-900/30 border border-red-700/40 text-red-300 px-4 py-3 rounded-lg text-sm mb-6">
            {error}
          </div>
        )}
        {children}
        <div className="mt-8 text-center text-xs text-gray-500 space-y-2">
          <p className="border-t border-white/10 pt-4">
            &copy; {new Date().getFullYear()} InsuredByCam
          </p>
        </div>
      </div>
    </div>
  );

  // ── Render by step ─────────────────────────────────────────────────────────

  // Step: credentials
  if (step === 'credentials') {
    return (
      <Shell
        title={mode === 'login' ? 'Sign In' : 'Reset Password'}
        subtitle={mode === 'login' ? 'Access your dashboard' : 'Enter your email to receive a reset link'}>
        {mfaMessage && (
          <div className="bg-amber-900/30 border border-amber-700/40 text-amber-300 px-4 py-3 rounded-lg text-sm mb-6">
            {mfaMessage}
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
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-white placeholder-gray-500"
                placeholder="you@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-white placeholder-gray-500"
                placeholder="Enter your password" />
              <button type="button" onClick={() => { setMode('reset'); setError(''); setResetSuccess(''); }}
                className="text-sm text-emerald-400 hover:text-emerald-300 mt-2">
                Forgot password?
              </button>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Signing in\u2026' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-white placeholder-gray-500"
                placeholder="you@example.com" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Sending\u2026' : 'Send Reset Link'}
            </button>
            <div className="text-center">
              <button type="button" onClick={() => { setMode('login'); setError(''); setResetSuccess(''); }}
                className="text-sm text-emerald-400 hover:text-emerald-300">
                Back to Sign In
              </button>
            </div>
          </form>
        )}
      </Shell>
    );
  }

  // Step: mfa_verify (existing factor)
  if (step === 'mfa_verify') {
    return (
      <Shell title="Two-Factor Authentication" subtitle="Enter the 6-digit code from Google Authenticator">
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Authentication Code</label>
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-white placeholder-gray-500 text-center text-2xl tracking-[0.5em] font-mono"
              placeholder="000000"
              autoComplete="one-time-code"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              Open Google Authenticator and enter the current code for insuredbycam
            </p>
          </div>
          <button type="submit" disabled={loading || code.length !== 6}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50">
            {loading ? 'Verifying\u2026' : 'Verify'}
          </button>
          <div className="text-center">
            <button type="button" onClick={() => { setStep('credentials'); setCode(''); setError(''); }}
              className="text-sm text-gray-500 hover:text-gray-400">
              &larr; Back to sign in
            </button>
          </div>
        </form>
      </Shell>
    );
  }

  // Step: mfa_enroll (no factor yet — force setup)
  if (step === 'mfa_enroll') {
    return (
      <Shell title="Set Up Two-Factor Authentication" subtitle="Scan this QR code with Google Authenticator">
        <div className="space-y-5">
          {/* QR Code */}
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-3 rounded-lg">
              {enrollData?.qrCode && (
                <img src={enrollData.qrCode} alt="MFA QR Code" style={{ width: 180, height: 180 }} />
              )}
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">
                Can't scan? Enter this code manually in Google Authenticator:
              </p>
              <code className="text-xs text-emerald-400 bg-gray-800/50 px-3 py-1 rounded font-mono tracking-wider">
                {enrollData?.secret}
              </code>
            </div>
          </div>

          <div className="bg-blue-900/20 border border-blue-700/30 rounded-lg p-4 text-sm text-blue-300 space-y-1">
            <p className="font-medium">How to set up:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs text-blue-300/80">
              <li>Download Google Authenticator on your phone</li>
              <li>Tap the + button and choose "Scan QR code"</li>
              <li>Scan the code above</li>
              <li>Enter the 6-digit code shown in the app below</li>
            </ol>
          </div>

          <form onSubmit={handleEnrollVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Verify — Enter the 6-digit code from the app
              </label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                className="w-full px-4 py-3 bg-gray-800/50 border border-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-white placeholder-gray-500 text-center text-2xl tracking-[0.5em] font-mono"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>
            <button type="submit" disabled={loading || code.length !== 6}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50">
              {loading ? 'Verifying\u2026' : 'Activate Two-Factor Authentication'}
            </button>
          </form>
        </div>
      </Shell>
    );
  }

  return null;
};

export default LoginPage;
