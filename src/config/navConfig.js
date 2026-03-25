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
  newsroom:         { to: '/news/dashboard',           label: 'Newsroom',    icon: '📰' },
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

// Get structured nav { primary, secondary } based on plane and role
export function getNavItems(plane, platformRole, agencyRole) {
  if (plane === PLANES.PLATFORM && platformRole) {
    const nav = platformNav[platformRole];
    if (nav) return nav;
    // Fallback for unknown platform roles
    return platformNav.platform_editor;
  }
  if (plane === PLANES.AGENCY && agencyRole) {
    const nav = agencyNav[agencyRole];
    if (nav) return nav;
    return agencyNav.producer;
  }
  // Consumer plane — no primary/secondary split, return flat for compatibility
  return { primary: consumerNav, secondary: [] };
}

// Get flat list of all nav items (for mobile menu / backwards compat)
export function getAllNavItems(plane, platformRole, agencyRole) {
  const { primary, secondary } = getNavItems(plane, platformRole, agencyRole);
  return [...primary, ...secondary];
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
  manager: 'Manager',
  producer: 'Producer',
};
