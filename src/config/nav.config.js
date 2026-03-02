// src/config/nav.config.js
// Two-Plane RBAC Navigation Configuration

export const PLANES = {
  CONSUMER: 'consumer',
  PLATFORM: 'platform',
  AGENCY: 'agency', // Future
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
    { to: '/news/dashboard', label: 'Newsroom', icon: '📰' },
    { to: '/admin/audit', label: 'Audit', icon: '🔍' },
  ],
  platform_admin: [
    { to: '/admin/agencies', label: 'Agencies', icon: '🏢' },
    { to: '/agency/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/agency/leads', label: 'Leads', icon: '📋' },
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

// Get navigation items based on plane and role
export function getNavItems(plane, platformRole) {
  if (plane === PLANES.PLATFORM && platformRole) {
    return platformNav[platformRole] || platformNav.platform_editor;
  }
  return consumerNav;
}

// Get default landing page after login
export function getDefaultLanding(platformRole) {
  if (platformRole) {
    if (platformRole === 'platform_editor') return '/news/dashboard';
    return '/admin/agencies';
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
};
