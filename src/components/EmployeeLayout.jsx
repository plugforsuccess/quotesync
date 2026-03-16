// Minimal layout for employee-scoped pages.
// No platform nav, no agency switcher, no admin tools.
// Bottom tab bar: Queue | Scorecard | Punch

import { Outlet, NavLink } from 'react-router-dom';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { supabase } from '../lib/supabase';

export default function EmployeeLayout() {
  const { data: employee } = useCurrentEmployee();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/admin-access-8by2X';
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0F1117', paddingBottom: 64 }}>
      {/* Top bar */}
      <div style={{ background: '#161924', borderBottom: '1px solid #252A3A',
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/allstate-badge.svg" alt="Allstate" style={{ height: 28 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>
            Wiley-Wilson Agency
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#64748B' }}>
            {employee?.preferred_name || employee?.first_name}
          </span>
          <a href="/mfa-settings"
            style={{ fontSize: 12, color: '#64748B', textDecoration: 'none' }}>
            MFA
          </a>
          <button onClick={handleSignOut}
            style={{ fontSize: 12, color: '#64748B', background: 'none',
              border: 'none', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Page content */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 16px 80px' }}>
        <Outlet />
      </div>

      {/* Bottom tab bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0,
        background: '#161924', borderTop: '1px solid #252A3A',
        display: 'flex', height: 56 }}>
        {[
          { to: '/my/queue',     icon: '\u26A1', label: 'Queue'     },
          { to: '/my/scorecard', icon: '\uD83D\uDCCA', label: 'Scorecard' },
          { to: '/punch',        icon: '\u23F1\uFE0F', label: 'Punch'     },
        ].map(({ to, icon, label }) => (
          <NavLink key={to} to={to}
            style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              textDecoration: 'none',
              color: isActive ? '#3B82F6' : '#64748B',
              fontSize: 10, fontWeight: 600,
            })}>
            <span style={{ fontSize: 20 }}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
