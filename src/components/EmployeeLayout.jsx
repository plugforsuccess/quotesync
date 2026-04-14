// Minimal layout for employee-scoped pages.
// No platform nav, no agency switcher, no admin tools.
// Bottom tab bar: Queue (service only) | Scorecard | Punch
// The Queue tab is gated on employees.roles — sales-only employees don't
// have a retention queue, so they shouldn't see the tab.

import { Outlet, NavLink } from 'react-router-dom';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { supabase } from '../lib/supabase';

export default function EmployeeLayout() {
  const { data: employee } = useCurrentEmployee();

  const roles = employee?.roles || [];
  const isService = roles.includes('service_inbound')
    || roles.includes('service_outbound');

  // Build tabs based on functional role
  const tabs = [];

  // Queue — service roles only (retention cases, pending cancel)
  if (isService) {
    tabs.push({ to: '/my/queue', icon: '\u26A1', label: 'Queue' });
  }

  // Scorecard — all employees
  tabs.push({ to: '/my/scorecard', icon: '\uD83D\uDCCA', label: 'Scorecard' });

  // Punch — all employees
  tabs.push({ to: '/punch', icon: '\u23F1\uFE0F', label: 'Punch' });

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/admin-access-8by2X';
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--qs-dark)', paddingBottom: 64 }}>
      {/* Top bar */}
      <div style={{ background: 'var(--qs-card)', borderBottom: '1px solid var(--qs-border)',
        padding: '12px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/allstate-badge.svg" alt="Allstate" style={{ height: 28 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--qs-bright)' }}>
            Wiley-Wilson Agency
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: 'var(--qs-subtle)' }}>
            {employee?.preferred_name || employee?.first_name}
          </span>
          <button onClick={handleSignOut}
            style={{ fontSize: 12, color: 'var(--qs-subtle)', background: 'none',
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
        background: 'var(--qs-card)', borderTop: '1px solid var(--qs-border)',
        display: 'flex', height: 56 }}>
        {tabs.map(({ to, icon, label }) => (
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
