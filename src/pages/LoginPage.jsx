// src/pages/LoginPage.jsx
// Simple login page for newsroom admin access

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [existingSession, setExistingSession] = useState(false);

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

  // Listen for auth changes and redirect when user is logged in
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[LoginPage] Auth event:', event, session?.user?.email);

      if (event === 'SIGNED_IN' && session) {
        // Delay to ensure AuthProvider has processed the change
        setTimeout(() => {
          console.log('[LoginPage] Navigating to dashboard');
          navigate('/news/dashboard');
        }, 300);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('[LoginPage] Attempting login...');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[LoginPage] Login error:', error);
        throw error;
      }

      console.log('[LoginPage] Login successful, waiting for auth state change...');
      // Don't navigate here - let the auth state change listener handle it
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Newsroom Login
          </h1>
          <p className="text-gray-600">
            Sign in to access the admin dashboard
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {existingSession && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded text-sm">
              <strong>Already logged in.</strong> You can{' '}
              <button
                type="button"
                onClick={() => navigate('/news/dashboard')}
                className="underline font-semibold hover:text-blue-900"
              >
                go to dashboard
              </button>{' '}
              or log in as a different user below.
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm">
              {error}
            </div>
          )}

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
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

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