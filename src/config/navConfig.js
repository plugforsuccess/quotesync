// src/config/navConfig.js
// Two-Plane RBAC Navigation Configuration
// Primary nav = always-visible links; Secondary nav = hamburger menu items

export const PLANES = {
  CONSUMER: 'consumer',
  PLATFORM: 'platform',
  AGENCY: 'agency',
};

// Consumer plane navigation (public/logged-out users)
export const consumerNav = [
  { to: '/quotes', label: 'Get Quote', icon: '🎯', isPrimary: true, scrollToQuote: true },
  { to: '/news', label: 'Newsroom', icon: '📰' },
  { to: '/courses', label: 'Courses', icon: '🚗' },
  { to: '/store', label: 'Store', icon: '🛍️' },
];

// ── Primary nav items (always visible in top bar) ────────────────────────────

const primaryItems = {
  funnel:           { to: '/agency/dashboard',         label: 'Dashboard',   icon: '📊' },
  leads:            { to: '/agency/leads',             label: 'Leads',       icon: '📋' },
  timeAttendance:   { to: '/agency/time-attendance',   label: 'Attendance',  icon: '⏱️' },
  staffPerformance: { to: '/agency/staff-performance', label: 'Performance', icon: '📈' },
  planning:         { to: '/agency/planning',          label: 'Planning',    icon: '📊' },
  retention:        { to: '/agency/retention',         label: 'Retention',   icon: '📈' },
  // Principal-facing entry. Renders under Layout (top nav). The rep-workspace
  // version /my/cross-sell renders the same component under EmployeeLayout.
  crossSell:        { to: '/agency/cross-sell',        label: 'Cross-Sell',  icon: '💡' },
  newsroom:         { to: '/news/dashboard',           label: 'Newsroom',    icon: '📰' },
  // Personal (rep-workspace) jumps — used by Sales/Service personas so a
  // principal wearing a rep hat can hop into Today / Queue / Scorecard from
  // the top nav without first switching back to Principal.
  today:            { to: '/my/today',                 label: 'Today',       icon: '⏱️' },
  myQueue:          { to: '/my/queue',                 label: 'My Queue',    icon: '⚡' },
  scorecard:        { to: '/my/scorecard',             label: 'Scorecard',   icon: '📊' },
  // Platform admin primary items
  adminDashboard:   { to: '/admin',                    label: 'Overview',    icon: '🏠' },
  adminAgencies:    { to: '/admin/agencies',           label: 'Agencies',    icon: '🏢' },
  adminSettings:    { to: '/admin/settings',           label: 'Settings',    icon: '⚙️' },
  adminAudit:       { to: '/admin/audit',              label: 'Audit Log',   icon: '🔍' },
  adminEmployees:   { to: '/admin/agency/employees',   label: 'Employees',   icon: '👥' },
};

// ── Secondary nav items (inside hamburger menu) ──────────────────────────────

const secondaryItems = {
  newsroom:            { to: '/news/dashboard',              label: 'Newsroom',            icon: '📰' },
  leads:               { to: '/agency/leads',                label: 'Leads',               icon: '📋' },
  agencyMgmt:          { to: '/admin/agencies',              label: 'Agency Management',   icon: '🏢' },
  employeeRoster:      { to: '/admin/agency/employees',      label: 'Employee Roster',     icon: '👥' },
  audit:               { to: '/admin/audit',                 label: 'Audit',               icon: '🔍' },
  planning:            { to: '/agency/planning',              label: 'Planning',            icon: '📊' },
};

// ── Platform plane navigation by role ────────────────────────────────────────
// Each role gets { primary: [...], secondary: [...] }

export const platformNav = {
  platform_master_admin: {
    primary: [
      primaryItems.adminDashboard,
      primaryItems.adminAgencies,
      primaryItems.adminEmployees,
      primaryItems.adminAudit,
      primaryItems.adminSettings,
    ],
    secondary: [
      secondaryItems.newsroom,
    ],
  },
  platform_admin: {
    primary: [
      primaryItems.adminDashboard,
      primaryItems.adminAgencies,
      primaryItems.adminEmployees,
      primaryItems.adminAudit,
    ],
    secondary: [
      secondaryItems.newsroom,
    ],
  },
  platform_support: {
    primary: [
      primaryItems.adminAgencies,
      primaryItems.adminAudit,
    ],
    secondary: [],
  },
  platform_auditor: {
    primary: [
      primaryItems.adminAudit,
    ],
    secondary: [],
  },
  platform_editor: {
    primary: [
      primaryItems.newsroom,
    ],
    secondary: [
      { to: '/news/standards', label: 'Standards', icon: '📋' },
    ],
  },
};

// ── Agency plane navigation by role (Allstate terminology) ───────────────────
// principal = agency owner, manager = team lead, producer = licensed staff

export const agencyNav = {
  principal: {
    primary: [
      primaryItems.funnel,
      primaryItems.leads,
      primaryItems.retention,
      primaryItems.staffPerformance,
      primaryItems.planning,
    ],
    secondary: [
      primaryItems.crossSell,
      primaryItems.timeAttendance,
      { to: '/agency/team', label: 'Team', icon: '👥' },
      { to: '/agency/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
  producer: {
    primary: [
      primaryItems.leads,
      primaryItems.timeAttendance,
    ],
    secondary: [],
  },
};

// Sales and Service personas live in EmployeeLayout (sidebar shell), not the
// top-nav Layout — clicking either pill redirects to /my/cross-sell or
// /my/today. So the top nav itself only ever renders the Principal items.
// If the user happens to land on a Layout page mid-persona-switch, the
// useAutoSyncPersona hook flips persona back to "principal" on the next
// render, which is what this fallback supports.

// ── Employee plane navigation (service_inbound / service_outbound) ──────────
// Employees see only their personal queue, scorecard, and punch clock.

export const employeeNav = {
  primary: [
    { to: '/my/queue',     label: 'Queue',     icon: '\u26A1', isPrimary: true },
    { to: '/my/scorecard', label: 'Scorecard', icon: '\uD83D\uDCCA', isPrimary: true },
    { to: '/punch',        label: 'Punch',     icon: '\u23F1\uFE0F', isPrimary: true },
  ],
  secondary: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Get structured nav { primary, secondary } based on plane, role, and (for
// principals) the active persona. Persona only reshapes the principal nav —
// other roles ignore it.
export function getNavItems(plane, platformRole, agencyRole, persona = 'principal') {
  if (plane === PLANES.PLATFORM && platformRole) {
    const nav = platformNav[platformRole];
    if (nav) return nav;
    // Fallback for unknown platform roles
    return platformNav.platform_editor;
  }
  if (plane === PLANES.AGENCY && agencyRole) {
    // Principal Layout (top nav) is identical regardless of persona because
    // Sales and Service personas now use EmployeeLayout. The persona arg is
    // accepted for API parity but the fallback to agencyNav.principal is
    // what actually renders.
    if (agencyRole === 'principal') return agencyNav.principal;
    const nav = agencyNav[agencyRole];
    if (nav) return nav;
    return agencyNav.producer;
  }
  // Consumer plane — no primary/secondary split, return flat for compatibility
  return { primary: consumerNav, secondary: [] };
}

// Get flat list of all nav items (for mobile menu / backwards compat)
export function getAllNavItems(plane, platformRole, agencyRole, persona = 'principal') {
  const { primary, secondary } = getNavItems(plane, platformRole, agencyRole, persona);
  return [...primary, ...secondary];
}

// Map a URL path to the persona that owns it. Used to keep the persona pill
// honest as the user navigates (so visiting /agency/retention while the pill
// reads "Sales" auto-flips it back to Principal). Only relevant for
// principals — other roles don't have personas.
export function personaForPath(pathname) {
  if (!pathname) return null;
  if (pathname.startsWith('/my/cross-sell')) return 'sales';
  if (pathname.startsWith('/my/')) return 'service';
  if (pathname === '/punch' || pathname.startsWith('/punch/')) return 'service';
  if (pathname.startsWith('/agency/') || pathname.startsWith('/admin/')) return 'principal';
  return null;
}

// Get default landing page after login
// Pass agency object to check setup status for onboarding redirect
export function getDefaultLanding(platformRole, agencyRole, agency = null) {
  if (platformRole) {
    if (platformRole === 'platform_editor') return '/news/dashboard';
    if (platformRole === 'platform_master_admin' || platformRole === 'platform_admin') return '/admin';
    return '/agency/dashboard';
  }
  if (agencyRole) {
    // MT-04: Redirect new agents to setup page if onboarding not complete
    if (agencyRole === 'principal' && agency && !agency.setup_completed_at) {
      return '/agency/setup';
    }
    // Employees land on their personal queue. /agency/leads requires
    // producer-or-higher and would redirect to /unauthorized otherwise.
    if (agencyRole === 'employee') return '/my/queue';
    if (agencyRole === 'principal') return '/agency/dashboard';
    return '/agency/leads';
  }
  return '/';
}

// Role display names
export const roleDisplayNames = {
  platform_master_admin: 'Master Admin',
  platform_admin: 'Admin',
  platform_support: 'Support',
  platform_editor: 'Editor',
  platform_auditor: 'Auditor',
  principal: 'Principal',
  owner: 'Owner',
  manager: 'Manager',
  producer: 'Producer',
  employee: 'Employee',
};
