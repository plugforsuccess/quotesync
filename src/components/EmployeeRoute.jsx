// Route guard for employee-scoped pages.
// Allows any authenticated user with an active employee record.
// Redirects unauthenticated users to login.
// Shows error for authenticated non-employees.

import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { supabase } from '../lib/supabase';
import PageSpinner from './PageSpinner';

export default function EmployeeRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { data: employee, isLoading: empLoading } = useCurrentEmployee();

  // MFA assurance level check
  const [aalLevel, setAalLevel] = useState(null);
  const [aalLoading, setAalLoading] = useState(true);

  useEffect(() => {
    if (!user) { setAalLoading(false); return; }
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setAalLevel(data);
      setAalLoading(false);
    });
  }, [user]);

  if (authLoading || empLoading || aalLoading) return <PageSpinner />;

  // Not logged in → login page
  if (!user) return <Navigate to="/admin-access-8by2X" replace />;

  // If user has a factor enrolled but current session is only aal1,
  // redirect back to login to complete MFA
  if (aalLevel?.nextLevel === 'aal2' && aalLevel?.currentLevel !== 'aal2') {
    return <Navigate to="/admin-access-8by2X" replace
      state={{ reason: 'mfa_required', message: 'Please complete two-factor authentication.' }} />;
  }

  // Employee record not found → show an informative error
  if (!employee) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#0F1117', padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', marginBottom: 8 }}>
            No employee record found
          </div>
          <div style={{ fontSize: 14, color: '#64748B' }}>
            Your account isn't linked to an employee profile yet.
            Contact your agency administrator.
          </div>
        </div>
      </div>
    );
  }

  return children;
}
