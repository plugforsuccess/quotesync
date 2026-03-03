// src/config/nav.config.js
// Two-Plane RBAC Navigation Configuration

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

// Platform plane navigation by role
export const platformNav = {
  platform_master_admin: [
    { to: '/admin/agencies', label: 'Agencies', icon: '🏢' },
    { to: '/agency/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/agency/leads', label: 'Leads', icon: '📋' },
    { to: '/admin/time-attendance', label: 'Operations', icon: '⏱️' },
    { to: '/news/dashboard', label: 'Newsroom', icon: '📰' },
    { to: '/admin/audit', label: 'Audit', icon: '🔍' },
  ],
  platform_admin: [
    { to: '/admin/agencies', label: 'Agencies', icon: '🏢' },
    { to: '/agency/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/agency/leads', label: 'Leads', icon: '📋' },
    { to: '/admin/time-attendance', label: 'Operations', icon: '⏱️' },
    { to: '/news/dashboard', label: 'Newsroom', icon: '📰' },
    { to: '/admin/audit', label: 'Audit', icon: '🔍' },
  ],
  platform_support: [
    { to: '/admin/agencies', label: 'Agencies', icon: '🏢' },
    { to: '/agency/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/agency/leads', label: 'Leads', icon: '📋' },
  ],
  platform_editor: [
    { to: '/news/dashboard', label: 'Newsroom', icon: '📰' },
    { to: '/news/standards', label: 'Standards', icon: '📋' },
  ],
  platform_auditor: [
    { to: '/admin/audit', label: 'Audit', icon: '🔍' },
  ],
};

// Agency plane navigation by role (Allstate terminology)
// agent = agency principal (owns the book), producer = licensed staff
export const agencyNav = {
  agent: [
    { to: '/agency/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/agency/leads', label: 'Leads', icon: '📋' },
    { to: '/agency/settings', label: 'Settings', icon: '⚙️' },
  ],
  producer: [
    { to: '/agency/leads', label: 'My Leads', icon: '📋' },
  ],
};

// Get navigation items based on plane and role
export function getNavItems(plane, platformRole, agencyRole) {
  if (plane === PLANES.PLATFORM && platformRole) {
    return platformNav[platformRole] || platformNav.platform_editor;
  }
  if (plane === PLANES.AGENCY && agencyRole) {
    return agencyNav[agencyRole] || agencyNav.producer;
  }
  return consumerNav;
}

// Get default landing page after login
export function getDefaultLanding(platformRole, agencyRole) {
  if (platformRole) {
    if (platformRole === 'platform_editor') return '/news/dashboard';
    return '/admin/agencies';
  }
  if (agencyRole) {
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
