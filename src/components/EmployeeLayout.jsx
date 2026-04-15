// Desktop layout for employee-scoped pages.
// Fixed left sidebar with navigation + user info.
// Full-width content area on the right.

import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { supabase } from '../lib/supabase';
import ThemeToggle from './ThemeToggle';

// Universal "toggle sidebar" icon — rectangle with a left panel divider.
// Same glyph used in VS Code, Linear, Figma, Notion.
function PanelLeftIcon({ size = 18 }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

// Inline SVG nav icons — emoji rendering is unreliable across platforms, and
// the clock emoji in particular is nearly invisible at small sizes.
const NAV_ITEMS = [
  {
    to: '/my/queue',
    label: 'My Queue',
    desc: 'Pending cancels & renewals',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h4l2 13h10l2-8H6" />
        <circle cx="10" cy="20" r="1.5" />
        <circle cx="18" cy="20" r="1.5" />
      </svg>
    ),
  },
  {
    to: '/my/scorecard',
    label: 'Scorecard',
    desc: 'My performance metrics',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6"  y1="20" x2="6"  y2="14"/>
      </svg>
    ),
  },
  {
    to: '/punch',
    label: 'Time Clock',
    desc: 'Punch in / punch out',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    ),
  },
];

export default function EmployeeLayout() {
  const { data: employee } = useCurrentEmployee();

  // Persist collapsed state so navigation/refresh doesn't reset the layout.
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('qs_sidebar_collapsed') === 'true'; }
    catch { return false; }
  });

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem('qs_sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  }

  // Agency branding — pull name + logo for the sidebar header.
  const { data: agencyData } = useQuery({
    queryKey: ['employee_agency', employee?.org_id],
    queryFn: async () => {
      if (!employee?.org_id) return null;
      const { data } = await supabase
        .from('agencies')
        .select('name, brand_name, logo_url')
        .eq('id', employee.org_id)
        .single();
      return data;
    },
    enabled: !!employee?.org_id,
    staleTime: 30 * 60 * 1000, // agency data rarely changes
  });

  const agencyName = agencyData?.brand_name || agencyData?.name || 'Agency';
  // Show the legal name underneath when it differs from the brand name
  // (e.g. brand "Cam Wiley Insurance" / legal "Wiley-Wilson"); otherwise
  // fall back to the generic "Agency" label.
  const agencySubtext =
    agencyData?.brand_name && agencyData?.name && agencyData.brand_name !== agencyData.name
      ? agencyData.name
      : 'Agency';
  const agencyLogoUrl = agencyData?.logo_url || null;

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

  const sidebarWidth = collapsed ? 64 : 220;

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: 'var(--qs-dark)',
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    }}>

      {/* ── Left Sidebar ─────────────────────────────────────────── */}
      <aside style={{
        width: sidebarWidth,
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
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* Agency logo / branding. The collapse toggle lives outside the
            sidebar as a floating tab (see below) so it stays reachable in
            both states. */}
        <div style={{
          padding: collapsed ? '20px 12px 16px' : '20px 16px 16px',
          borderBottom: '1px solid var(--qs-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: 10,
          minHeight: 68,
        }}>
          {agencyLogoUrl ? (
            <img src={agencyLogoUrl} alt="Agency"
              style={{ height: 32, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <img src="/allstate-badge.svg" alt="Allstate"
              style={{ height: 32, flexShrink: 0 }} />
          )}
          {!collapsed && (
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <div style={{
                fontSize: 14, fontWeight: 700,
                color: 'var(--qs-bright)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {agencyName || 'Agency'}
              </div>
              <div style={{
                fontSize: 11, color: 'var(--qs-subtle)', marginTop: 1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {agencySubtext}
              </div>
            </div>
          )}
        </div>

        {/* Navigation links */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon, label, desc }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? label : undefined}
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
                justifyContent: collapsed ? 'center' : 'flex-start',
              })}
            >
              {({ isActive }) => (
                <>
                  <span style={{
                    width: 20, height: 20,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    color: isActive ? '#3B82F6' : 'var(--qs-dim)',
                  }}>
                    {icon}
                  </span>
                  {!collapsed && (
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
                  )}
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
          padding: collapsed ? '16px 10px 20px' : '16px 16px 20px',
          borderTop: '1px solid var(--qs-border)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}>
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
            {!collapsed && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-bright)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {fullName}
                </div>
                <div style={{ fontSize: 11, color: 'var(--qs-dim)', marginTop: 1 }}>
                  {roleLabel}
                </div>
              </div>
            )}
          </div>
          {!collapsed && (
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
          )}
        </div>
      </aside>

      {/* ── Floating sidebar toggle ───────────────────────────────────
          Sits on the right edge of the sidebar as a half-exposed tab so
          it stays visible and clickable in both expanded and collapsed
          states. */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? 'Open sidebar' : 'Close sidebar'}
        aria-label={collapsed ? 'Open sidebar' : 'Close sidebar'}
        style={{
          position: 'fixed',
          top: 20,
          // Sits just beyond the right edge of the sidebar
          left: (collapsed ? 64 : 220) - 12,
          zIndex: 200,
          width: 24,
          height: 24,
          padding: 0,
          borderRadius: '0 6px 6px 0',
          background: 'var(--qs-elevated)',
          border: '1px solid var(--qs-border)',
          borderLeft: 'none',
          color: 'var(--qs-subtle)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'left 0.2s ease, opacity 0.15s, color 0.15s',
          opacity: 0.7,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.opacity = '1';
          e.currentTarget.style.color = 'var(--qs-bright)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.opacity = '0.7';
          e.currentTarget.style.color = 'var(--qs-subtle)';
        }}
      >
        <PanelLeftIcon size={14} />
      </button>

      {/* ── Main content area ─────────────────────────────────────── */}
      <main style={{
        marginLeft: sidebarWidth,
        transition: 'margin-left 0.2s ease',
        flex: 1,
        minHeight: '100vh',
        padding: '28px 36px',
        maxWidth: `calc(100vw - ${sidebarWidth}px)`,
        boxSizing: 'border-box',
      }}>
        <Outlet />
      </main>
    </div>
  );
}
