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
  funnel:         { to: '/agency/dashboard',      label: 'Dashboard',          icon: '📊' },
  leads:          { to: '/agency/leads',           label: 'Leads',              icon: '📋' },
  timeAttendance: { to: '/admin/time-attendance',  label: 'Attendance',         icon: '⏱️' },
  staffPerformance: { to: '/admin/staff-performance', label: 'Performance',        icon: '📈' },
  renewals:         { to: '/admin/renewals',              label: 'Renewals',         icon: '🔄' },
  planning:           { to: '/admin/planning',             label: 'Planning',       icon: '📊' },
  bookHealth:     { to: '/admin/book-health',        label: 'Book Health',        icon: '🛡️' },
  newsroom:       { to: '/news/dashboard',         label: 'Newsroom',           icon: '📰' },
};

// ── Secondary nav items (inside hamburger menu) ──────────────────────────────

const secondaryItems = {
  newsroom:            { to: '/news/dashboard',              label: 'Newsroom',            icon: '📰' },
  leads:               { to: '/agency/leads',                label: 'Leads',               icon: '📋' },
  agencyMgmt:          { to: '/admin/agencies',              label: 'Agency Management',   icon: '🏢' },
  employeeRoster:      { to: '/admin/agency/employees',      label: 'Employee Roster',     icon: '👥' },
  audit:               { to: '/admin/audit',                 label: 'Audit',               icon: '🔍' },
  planning:            { to: '/admin/planning',               label: 'Planning',            icon: '📊' },
};

// ── Platform plane navigation by role ────────────────────────────────────────
// Each role gets { primary: [...], secondary: [...] }

export const platformNav = {
  platform_master_admin: {
    primary: [
      primaryItems.funnel,
      primaryItems.timeAttendance,
      primaryItems.staffPerformance,
      primaryItems.renewals,
      primaryItems.planning,
      primaryItems.bookHealth,
    ],
    secondary: [
      secondaryItems.leads,
      secondaryItems.newsroom,
      secondaryItems.agencyMgmt,
      secondaryItems.employeeRoster,
      secondaryItems.audit,
    ],
  },
  platform_admin: {
    primary: [
      primaryItems.funnel,
      primaryItems.timeAttendance,
      primaryItems.staffPerformance,
      primaryItems.renewals,
      primaryItems.planning,
      primaryItems.bookHealth,
    ],
    secondary: [
      secondaryItems.leads,
      secondaryItems.newsroom,
      secondaryItems.agencyMgmt,
      secondaryItems.employeeRoster,
      secondaryItems.audit,
    ],
  },
  platform_support: {
    primary: [
      primaryItems.funnel,
      primaryItems.leads,
    ],
    secondary: [
      secondaryItems.audit,
    ],
  },
  platform_editor: {
    primary: [
      primaryItems.newsroom,
    ],
    secondary: [
      { to: '/news/standards', label: 'Standards', icon: '📋' },
    ],
  },
  platform_auditor: {
    primary: [],
    secondary: [
      secondaryItems.audit,
    ],
  },
};

// ── Agency plane navigation by role (Allstate terminology) ───────────────────
// agent = agency principal (owns the book), producer = licensed staff

export const agencyNav = {
  agent: {
    primary: [
      primaryItems.funnel,
      primaryItems.leads,
      primaryItems.timeAttendance,
      primaryItems.staffPerformance,
      primaryItems.renewals,
    ],
    secondary: [
      { to: '/agency/settings', label: 'Settings', icon: '⚙️' },
      { to: '/agency/team', label: 'Team', icon: '👥' },
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
    return '/agency/dashboard';
  }
  if (agencyRole) {
    // MT-04: Redirect new agents to setup page if onboarding not complete
    if (agencyRole === 'agent' && agency && !agency.setup_completed_at) {
      return '/agency/setup';
    }
    if (agencyRole === 'agent') return '/agency/dashboard';
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
  agent: 'Agent',
  producer: 'Producer',
};
