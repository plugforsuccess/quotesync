import { createContext, useContext } from 'react';

export const AuthContext = createContext({
  user: null,
  profile: null,
  role: 'viewer',
  isPlatformUser: false,
  platformRole: null,
  agencyMemberships: [],
  currentAgencyId: null,
  currentAgencyRole: null,
  isImpersonating: false,
  impersonationSession: null,
  loading: true,
  authError: null,
  signOut: async () => {},
  refreshUser: async () => {},
  setCurrentAgency: () => {},
  startImpersonation: async () => {},
  endImpersonation: async () => {}
});

export const PLATFORM_ROLE_HIERARCHY = {
  platform_auditor: 1,
  platform_editor: 2,
  platform_support: 3,
  platform_admin: 4,
  platform_master_admin: 5
};

export const AGENCY_ROLE_HIERARCHY = {
  producer: 1,
  agent: 2
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
