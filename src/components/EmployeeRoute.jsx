// Route guard for employee-scoped pages.
// Allows any authenticated user with an active employee record.
// Redirects unauthenticated users to login.
// Shows error for authenticated non-employees.
//
// IMPORTANT: useCurrentEmployee now depends on auth resolving first.
// The guard must wait for BOTH authLoading AND empLoading before making
// any decisions — otherwise a race condition causes a false
// "No employee record found" on first navigation after login.
// empFetching additionally covers the retry case — when TanStack Query
// re-fetches after an initial null result, isLoading is false but
// isFetching is true.

import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import PageSpinner from './PageSpinner';

export default function EmployeeRoute({ children }) {
  const { user, loading: authLoading } = useAuth();
  const { data: employee, isLoading: empLoading, isFetching: empFetching } = useCurrentEmployee();

  // Wait for auth AND employee query to fully resolve.
  // empFetching covers the retry case — query may be re-fetching after null.
  if (authLoading || empLoading || empFetching) return <PageSpinner />;

  // Not logged in → login page (only show spinner if token is still valid)
  if (!user) {
    try {
      const tokenKey = Object.keys(localStorage).find(
        k => k.startsWith('sb-') && k.endsWith('-auth-token')
      );
      if (tokenKey) {
        const raw = localStorage.getItem(tokenKey);
        const parsed = raw ? JSON.parse(raw) : null;
        const expiresAt = parsed?.expires_at;
        const isStillValid = expiresAt && (expiresAt * 1000) > Date.now();
        if (isStillValid) return <PageSpinner />;
      }
    } catch (_) {}
    return <Navigate to="/admin-access-8by2X" replace />;
  }

  // Employee record not found → show an informative error
  if (!employee) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: 'var(--qs-dark)', padding: 24 }}>
        <div style={{ maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--qs-bright)', marginBottom: 8 }}>
            No employee record found
          </div>
          <div style={{ fontSize: 14, color: 'var(--qs-subtle)' }}>
            Your account isn't linked to an employee profile yet.
            Contact your agency administrator.
          </div>
        </div>
      </div>
    );
  }

  // Force password reset before accessing any employee page.
  // The /my/change-password route is registered outside this gate so it
  // can render without recursing through EmployeeRoute.
  if (employee.must_reset_password) {
    return <Navigate to="/my/change-password" replace />;
  }

  return children;
}
