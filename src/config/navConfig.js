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
  { to: '/giveaway', label: 'Giveaway', icon: '🎁' },
];

// ── Primary nav items (always visible in top bar) ────────────────────────────

const primaryItems = {
  funnel:           { to: '/agency/dashboard',         label: 'Dashboard',   icon: '📊' },
  leads:            { to: '/agency/leads',             label: 'Leads',       icon: '📋' },
  timeAttendance:   { to: '/agency/time-attendance',   label: 'Attendance',  icon: '⏱️' },
  staffPerformance: { to: '/agency/staff-performance', label: 'Performance', icon: '📈' },
  planning:         { to: '/agency/planning',          label: 'Planning',    icon: '📊' },
  retention:        { to: '/agency/retention',         label: 'Retention',   icon: '📈' },
  crossSell:        { to: '/agency/cross-sell',        label: 'Cross-Sell',  icon: '💡' },
  customers:        { to: '/agency/customers',          label: 'Customers',   icon: '🔎' },
  referrals:        { to: '/agency/referrals',         label: 'Referrals',   icon: '🎁' },
  newsroom:         { to: '/news/dashboard',           label: 'Newsroom',    icon: '📰' },
  // Personal (rep-workspace) jumps — used by Sales/Service personas so a
  // principal wearing a rep hat can hop into Today / Queue / Scorecard from
  // the top nav without first switching back to Principal.
  today:            { to: '/my/today',                 label: 'Today',       icon: '⏱️' },
  myQueue:          { to: '/my/queue',                 label: 'My Queue',    icon: '⚡' },
  serviceBatch:     { to: '/my/service-batch',         label: 'Service Batch', icon: '🗂️' },
  myLeads:          { to: '/my/leads',                 label: 'My Leads',    icon: '🎯' },
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
      { to: '/agency/weekly-review', label: 'Review', icon: '📋' },
      primaryItems.funnel,
      primaryItems.leads,
      primaryItems.retention,
      primaryItems.planning,
    ],
    secondary: [
      primaryItems.staffPerformance,
      primaryItems.crossSell,
      primaryItems.customers,
      primaryItems.referrals,
      primaryItems.timeAttendance,
      { to: '/agency/comp-schedules', label: 'Comp Schedules', icon: '💰' },
      { to: '/agency/settings/termination-aliases', label: 'Reason Aliases', icon: '🏷️' },
      { to: '/agency/team', label: 'Team', icon: '👥' },
      { to: '/agency/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
  producer: {
    primary: [
      primaryItems.leads,
      primaryItems.timeAttendance,
    ],
    secondary: [
      primaryItems.referrals,
    ],
  },
};

// ── Persona-specific nav for principals wearing a rep hat ────────────────────
// A principal who is also opted into rep work can switch personas (Sales,
// Service) via the PersonaSwitcher. Each persona reshapes the top nav so it
// only shows the surfaces relevant to that hat — no more Dashboard/Leads/
// Retention crowding the row when the principal is in Sales mode.
//
// Only consulted when agencyRole === 'principal'. Other roles (producer,
// employee) keep their static nav above; they don't have personas.

export const principalPersonaNav = {
  principal: agencyNav.principal,
  // Sales hat: cross-sell work + production scorecard + referrals + time clock.
  // No retention surfaces (Today / My Queue) — those belong to the service hat.
  sales: {
    primary: [
      primaryItems.myLeads,
      primaryItems.crossSell,
      primaryItems.scorecard,
      primaryItems.referrals,
    ],
    secondary: [
      primaryItems.customers,
      { to: '/punch', label: 'Time Clock', icon: '⏱️' },
    ],
  },
  // Service hat: retention queues + retention scorecard + time clock.
  service: {
    primary: [
      primaryItems.today,
      primaryItems.myQueue,
      primaryItems.serviceBatch,
      primaryItems.scorecard,
    ],
    secondary: [
      primaryItems.customers,
      { to: '/punch', label: 'Time Clock', icon: '⏱️' },
    ],
  },
};

// ── Employee plane navigation (service_inbound / service_outbound) ──────────
// Employees see only their personal queue, scorecard, and punch clock.

export const employeeNav = {
  primary: [
    { to: '/my/queue',         label: 'Queue',         icon: '\u26A1', isPrimary: true },
    { to: '/my/service-batch', label: 'Service Batch', icon: '\uD83D\uDDC2\uFE0F', isPrimary: true },
    { to: '/my/leads',     label: 'Leads',     icon: '\uD83C\uDFAF', isPrimary: true },
    { to: '/my/scorecard', label: 'Scorecard', icon: '\uD83D\uDCCA', isPrimary: true },
    { to: '/punch',        label: 'Punch',     icon: '\u23F1\uFE0F', isPrimary: true },
  ],
  secondary: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Resolve a rep employee's active "hat" from their roles + the persona pill.
// A dual-role (sales + service) employee follows the pill; a single-role
// employee uses their one role. Returns null for non-rep members (a manager or
// producer with no rep roles) so they keep their normal nav.
export function hatForRoles(roles = [], persona) {
  const hasService = roles.some(r => ['service_inbound', 'service_outbound', 'service'].includes(r));
  const hasSales = roles.includes('sales');
  if (hasSales && hasService) return persona === 'service' ? 'service' : 'sales';
  if (hasSales) return 'sales';
  if (hasService) return 'service';
  return null;
}

// Get structured nav { primary, secondary } based on plane, role, and (for
// principals) the active persona. Persona only reshapes the principal nav —
// other roles ignore it.
export function getNavItems(plane, platformRole, agencyRole, persona = 'principal', repRoles = []) {
  if (plane === PLANES.PLATFORM && platformRole) {
    const nav = platformNav[platformRole];
    if (nav) return nav;
    // Fallback for unknown platform roles
    return platformNav.platform_editor;
  }
  if (plane === PLANES.AGENCY && agencyRole) {
    if (agencyRole === 'principal') {
      return principalPersonaNav[persona] || principalPersonaNav.principal;
    }
    // A rep employee (agency_role 'employee') with sales/service roles gets the
    // same hat-based nav a principal sees in that persona, so a sales employee
    // on Cross-Sell / Referrals sees their sales tabs — not the producer
    // fallback. Higher roles (manager/producer) keep their own nav.
    if (agencyRole === 'employee') {
      const hat = hatForRoles(repRoles, persona);
      if (hat) return principalPersonaNav[hat];
    }
    const nav = agencyNav[agencyRole];
    if (nav) return nav;
    return agencyNav.producer;
  }
  // Consumer plane — no primary/secondary split, return flat for compatibility
  return { primary: consumerNav, secondary: [] };
}

// Get flat list of all nav items (for mobile menu / backwards compat)
export function getAllNavItems(plane, platformRole, agencyRole, persona = 'principal', repRoles = []) {
  const { primary, secondary } = getNavItems(plane, platformRole, agencyRole, persona, repRoles);
  return [...primary, ...secondary];
}

// Map a URL path to the persona that owns it. Used to keep the persona pill
// honest as the user navigates (so visiting /agency/retention while the pill
// reads "Sales" auto-flips it back to Principal). Only relevant for
// principals — other roles don't have personas.
export function personaForPath(pathname) {
  if (!pathname) return null;
  // Shared surfaces live in more than one hat's nav, so they must NOT flip the
  // active persona — the pill stays whatever the user picked (this is what lets
  // the scorecard render the sales OR service view based on the live persona).
  if (pathname.startsWith('/my/scorecard')) return null;
  if (pathname === '/punch' || pathname.startsWith('/punch/')) return null;
  if (pathname.startsWith('/agency/referrals')) return null;
  if (pathname.startsWith('/my/referrals')) return null;
  // Customer Search is in both producer hats — don't flip the pill.
  if (pathname.startsWith('/agency/customers')) return null;

  if (pathname.startsWith('/agency/cross-sell')) return 'sales';
  if (pathname.startsWith('/my/cross-sell')) return 'sales';
  // /my/leads is the SALES hat's lead queue — must beat the /my/ catch-all
  // below, which otherwise flips the pill to service.
  if (pathname.startsWith('/my/leads')) return 'sales';
  if (pathname.startsWith('/my/')) return 'service';
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
