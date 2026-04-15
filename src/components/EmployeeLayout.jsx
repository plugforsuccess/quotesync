// Desktop layout for employee-scoped pages.
// Fixed left sidebar with navigation + user info.
// Full-width content area on the right.

import { Outlet, NavLink } from 'react-router-dom';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { supabase } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';

const NAV_ITEMS = [
  { to: '/my/queue',     icon: '\u26A1',         label: 'My Queue',   desc: 'Pending cancels & renewals' },
  { to: '/my/scorecard', icon: '\uD83D\uDCCA',   label: 'Scorecard',  desc: 'My performance metrics'     },
  { to: '/punch',        icon: '\u23F1',         label: 'Time Clock', desc: 'Punch in / punch out'       },
];

export default function EmployeeLayout() {
  const { data: employee } = useCurrentEmployee();

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/admin-access-8by2X';
  }

  const fullName = employee
    ? `${employee.preferred_name || employee.first_name} ${employee.last_name}`
    : '';
  const initials = employee
    ? `${(employee.preferred_name || employee.first_name || '')[0] || ''}${(employee.last_name || '')[0] || ''}`
    : '\u2014';
  const roleLabel = (employee?.roles || [])
    .map(r => r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
    .join(', ') || 'Employee';

  return (
    <div className="qs-app-shell" style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--qs-dark)',
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    }}>

      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--qs-card)',
        borderRight: '1px solid var(--qs-border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 100,
      }}>

        {/* Agency logo / branding */}
        <div style={{
          padding: '20px 20px 16px',
          borderBottom: '1px solid var(--qs-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/allstate-badge.svg" alt="Allstate" style={{ height: 32 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--qs-bright)',
                lineHeight: 1.2 }}>
                Wiley-Wilson
              </div>
              <div style={{ fontSize: 11, color: 'var(--qs-dim)' }}>Agency</div>
            </div>
          </div>
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label, desc }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 2,
                textDecoration: 'none',
                background: isActive ? 'rgba(59,130,246,0.12)' : 'transparent',
                border: isActive ? '1px solid rgba(59,130,246,0.25)' : '1px solid transparent',
                transition: 'all 0.15s',
                cursor: 'pointer',
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{
                    fontSize: 18,
                    width: 28,
                    textAlign: 'center',
                    opacity: isActive ? 1 : 0.7,
                  }}>
                    {icon}
                  </span>
                  <div>
                    <div style={{
                      fontSize: 14,
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#3B82F6' : 'var(--qs-text)',
                      lineHeight: 1.2,
                    }}>
                      {label}
                    </div>
                    <div style={{
                      fontSize: 11,
                      color: 'var(--qs-dim)',
                      marginTop: 1,
                    }}>
                      {desc}
                    </div>
                  </div>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Theme toggle — dark / light / high contrast */}
        <div style={{
          padding: '0 10px 12px',
          borderBottom: '1px solid var(--qs-border)',
          marginBottom: 12,
        }}>
          <ThemeToggle variant="switch" />
        </div>

        {/* User identity + sign out */}
        <div style={{
          padding: '16px 16px 20px',
          borderTop: '1px solid var(--qs-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {/* Avatar */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(59,130,246,0.2)',
              border: '1px solid rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#3B82F6', flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fullName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 1 }}>
                {roleLabel}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            style={{
              width: '100%', padding: '8px', borderRadius: 7,
              background: 'var(--qs-elevated)', border: '1px solid var(--qs-border)',
              color: 'var(--qs-dim)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', textAlign: 'center',
              transition: 'color 0.15s, border-color 0.15s',
            }}
            onMouseEnter={e => {
              e.target.style.color = '#EF4444';
              e.target.style.borderColor = 'rgba(239,68,68,0.3)';
            }}
            onMouseLeave={e => {
              e.target.style.color = 'var(--qs-dim)';
              e.target.style.borderColor = 'var(--qs-border)';
            }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────── */}
      <main style={{
        marginLeft: 220,
        flex: 1,
        minHeight: '100vh',
        padding: '28px 36px',
        maxWidth: 'calc(100vw - 220px)',
        boxSizing: 'border-box',
      }}>
        <Outlet />
      </main>
    </div>
  );
}
