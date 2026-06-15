// Layout for employee-scoped pages (/my/*).
//
// Uses the same top-nav language as the principal app (Layout.jsx): a sticky
// glass navy bar with the agency brand on the left, pill navigation, and the
// persona switcher + sign-out on the right. Content sits full-width below so
// queue screens can use the whole viewport instead of a narrow sidebar gutter.

import { Outlet, NavLink, Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useCurrentEmployee } from '../hooks/useCurrentEmployee';
import { useAuth } from '../contexts/AuthContext';
import { useAutoSyncPersona } from '../hooks/usePersona';
import { supabase } from '../lib/supabase';
import PersonaSwitcher from './PersonaSwitcher';
import { useForceTheme } from '../contexts/ThemeContext';

// Nav tabs by hat. The active hat is the persona for a dual-role producer,
// otherwise the employee's single role. Scorecard is shared.
const SCORECARD_ITEM     = { to: '/my/scorecard',     label: 'Scorecard' };
const SERVICE_BATCH_ITEM = { to: '/my/service-batch', label: 'Service Batch' };
// Time Clock (/punch) is hidden from the employee portal for now — the punch
// clock isn't in use yet. The route still works if opened directly; re-add
// { to: '/punch', label: 'Time Clock' } to the tab arrays below to restore it.

const SERVICE_TABS = [
  { to: '/my/today', label: 'Today' },
  { to: '/my/queue', label: 'My Queue' },
  SERVICE_BATCH_ITEM,
  SCORECARD_ITEM,
];

// Unlicensed (front desk): clerical intake only — Service Batch.
const UNLICENSED_TABS = [
  SERVICE_BATCH_ITEM,
];
// The only /my/* surfaces an unlicensed user may open (others redirect here).
const UNLICENSED_ALLOWED = ['/my/service-batch', '/my/change-password'];

const SALES_TABS = [
  { to: '/my/cross-sell', label: 'Cross-Sell' },
  SCORECARD_ITEM,
  { to: '/my/referrals',  label: 'Referrals' },
];

// Shared pill styling for the top nav — matches the principal nav's pill feel.
function navPillClass({ isActive }) {
  return [
    'qs-focusable px-4 py-2 rounded-lg text-[0.95rem] font-semibold whitespace-nowrap transition-colors',
    isActive
      ? 'bg-blue-100 text-blue-700'
      : 'text-gray-600 hover:text-gray-900 hover:bg-black/5',
  ].join(' ');
}

export default function EmployeeLayout() {
  const { data: employee } = useCurrentEmployee();
  const { currentAgencyRole } = useAuth();

  // Employees use the light theme by default across the whole employee app.
  useForceTheme('light');

  // A principal and a dual-role (sales + service) employee both wear more than
  // one hat, so both auto-sync the pill to the URL. Single-role employees just
  // get their one hat. The returned persona shapes the nav below.
  const location = useLocation();
  const empRoles = employee?.roles || [];
  const hasService = empRoles.includes('service_inbound')
    || empRoles.includes('service_outbound')
    || empRoles.includes('service');
  const hasSales = empRoles.includes('sales');
  const hasUnlicensed = empRoles.includes('unlicensed');
  const isPrincipal = currentAgencyRole === 'principal';
  const multiHat = isPrincipal || (hasSales && hasService);
  const [persona] = useAutoSyncPersona(multiHat, isPrincipal ? 'principal' : 'service');

  // Agency branding — pull name + logo for the nav header.
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
  // Show the legal name underneath when it differs from the brand name.
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
    : '—';

  const ROLE_SHORT = {
    service_inbound:  'Service',
    service_outbound: 'Service',
    service:          'Service',
    sales:            'Sales',
    principal:        'Principal',
    admin:            'Admin',
    manager:          'Manager',
  };
  const roleLabel = Array.from(new Set(
    (employee?.roles || []).map(r => ROLE_SHORT[r] || r.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()))
  )).join(' · ') || 'Employee';

  // The active hat: dual-role follows the pill, single-role uses its one role.
  // Unlicensed is the clerical-only hat, used only when there's no rep role.
  const hat = (hasSales && hasService)
    ? (persona === 'service' ? 'service' : 'sales')
    : hasSales ? 'sales'
    : hasService ? 'service'
    : hasUnlicensed ? 'unlicensed'
    : 'service';
  const navItems = hat === 'sales' ? SALES_TABS
    : hat === 'unlicensed' ? UNLICENSED_TABS
    : SERVICE_TABS;

  // Confine the unlicensed (front desk) hat to the Service Batch — they have no
  // license, so the retention queues and customer/coverage surfaces are off
  // limits. NOTE: this is a UI boundary; hardening it at the data layer
  // (role-aware RLS on renewal/cancel tables) is a recommended follow-up.
  const brandTo = hat === 'unlicensed' ? '/my/service-batch' : '/my/today';
  if (hat === 'unlicensed' && !UNLICENSED_ALLOWED.some(p => location.pathname.startsWith(p))) {
    return <Navigate to="/my/service-batch" replace />;
  }

  // Responsive side gutter shared by the nav bar and the content area so they
  // stay aligned while still letting content use the full viewport width.
  const pagePadX = 'clamp(1rem, 3vw, 3rem)';

  return (
    <div className="qs-app-shell" style={{
      minHeight: '100vh',
      background: 'var(--qs-dark)',
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
    }}>

      {/* ── Top nav bar (principal-style glass header) ───────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/10 shadow-sm">
        {/* Animated gradient accent line */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 animate-gradient-x" />

        <div className="flex items-center justify-between gap-4 py-3"
          style={{ paddingLeft: pagePadX, paddingRight: pagePadX }}>

          {/* Brand */}
          <NavLink to={brandTo} className="qs-focusable flex items-center gap-3 group min-w-0">
            {agencyLogoUrl ? (
              <img src={agencyLogoUrl} alt="" className="h-9 w-auto object-contain flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <div className="min-w-0">
              <div className="font-black text-base sm:text-lg tracking-tight text-gray-900 truncate">
                {agencyName}
              </div>
              <div className="text-xs text-gray-500 truncate">{agencySubtext}</div>
            </div>
          </NavLink>

          {/* Primary nav — desktop */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink key={to} to={to} end className={navPillClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Right cluster: persona switcher · identity · sign out */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:block">
              <PersonaSwitcher compact />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-[0.8125rem] font-bold flex-shrink-0"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.45)', color: '#1d4ed8' }}>
                {initials}
              </div>
              <div className="hidden lg:block min-w-0">
                <div className="text-[0.8125rem] font-semibold text-gray-900 truncate leading-tight">{fullName}</div>
                <div className="text-xs text-gray-500 truncate leading-tight">{roleLabel}</div>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="qs-focusable px-3 py-2 rounded-lg text-[0.875rem] font-semibold text-gray-600 hover:text-red-600 border border-black/10 hover:border-red-400 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Primary nav — mobile (second row, scrolls horizontally) */}
        <nav className="md:hidden flex items-center gap-1 overflow-x-auto pb-2"
          style={{ paddingLeft: pagePadX, paddingRight: pagePadX }}>
          {navItems.map(({ to, label }) => (
            <NavLink key={to} to={to} end className={navPillClass}>
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* ── Main content area ─────────────────────────────────────── */}
      <main style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: '1.75rem',
        paddingLeft: pagePadX,
        paddingRight: pagePadX,
        paddingBottom: '3rem',
      }}>
        <Outlet />
      </main>
    </div>
  );
}
