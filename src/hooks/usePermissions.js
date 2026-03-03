// src/hooks/usePermissions.js
// Two-plane RBAC permission hook
// Provides granular permission checks for platform and agency access

import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Permission hook for two-plane RBAC
 *
 * Platform Plane (internal staff):
 * - platform_master_admin: Full control
 * - platform_admin: Manage agencies, routing, users; read-only leads by default
 * - platform_support: View limited lead metadata for troubleshooting
 * - platform_editor: Newsroom content only; NO lead access
 * - platform_auditor: Read-only logs and compliance exports
 *
 * Tenant Plane (agency users - Allstate terminology):
 * - agent: Agency principal — owns the book, manages producers, full control
 * - producer: Licensed staff who work leads and write policies
 *
 * Future roles (schema supports, not yet enabled):
 * - manager: Lead routing, user management
 * - viewer: Read-only
 */
export function usePermissions() {
  const {
    user,
    isPlatformUser,
    platformRole,
    currentAgencyId,
    currentAgencyRole,
    agencyMemberships,
    isImpersonating,
    impersonationSession,
    hasPlatformRole,
    hasAgencyRole
  } = useAuth();

  // Platform permission checks
  const platform = useMemo(() => ({
    // Role checks
    isMasterAdmin: isPlatformUser && platformRole === 'platform_master_admin',
    isAdmin: hasPlatformRole('platform_admin'),
    isSupport: hasPlatformRole('platform_support'),
    isEditor: hasPlatformRole('platform_editor'),
    isAuditor: hasPlatformRole('platform_auditor'),

    // Feature access
    canManageAgencies: hasPlatformRole('platform_admin'),
    canManageRoutingRules: hasPlatformRole('platform_admin'),
    canManageUsers: hasPlatformRole('platform_admin'),
    canViewLeads: hasPlatformRole('platform_support'),
    canUpdateLeads: platformRole === 'platform_master_admin',
    canExportLeads: platformRole === 'platform_master_admin',
    canImpersonate: hasPlatformRole('platform_admin'),
    canViewAuditLog: hasPlatformRole('platform_auditor'),
    canManageNewsroom: hasPlatformRole('platform_editor'),
    canPublishStories: hasPlatformRole('platform_admin')
  }), [isPlatformUser, platformRole, hasPlatformRole]);

  // Agency permission checks (for current agency)
  // Allstate terminology: agent = principal, producer = staff
  const agency = useMemo(() => ({
    // Role checks (only agent/producer active)
    isPrincipal: hasAgencyRole('agent'),
    isProducer: hasAgencyRole('producer'),

    // Feature access (agent/principal gets all, producer gets lead work)
    canViewLeads: hasAgencyRole('producer'),      // producer+
    canUpdateLeads: hasAgencyRole('producer'),    // producer+
    canDeleteLeads: hasAgencyRole('agent'),    // agent only (no manager yet)
    canManageRouting: hasAgencyRole('agent'),  // agent only
    canInviteMembers: hasAgencyRole('agent'),  // agent only (no manager yet)
    canRemoveMembers: hasAgencyRole('agent'),  // agent only
    canUpdateMemberRoles: hasAgencyRole('agent'),
    canUpdateAgencySettings: hasAgencyRole('agent'),

    // Current agency info
    currentAgencyId,
    currentRole: currentAgencyRole,
    membershipCount: agencyMemberships.length
  }), [hasAgencyRole, currentAgencyId, currentAgencyRole, agencyMemberships]);

  // Combined access checks
  const can = useMemo(() => ({
    // Lead access (combines platform + agency)
    viewLeads: platform.canViewLeads || agency.canViewLeads,
    updateLeads: (platform.canUpdateLeads || agency.canUpdateLeads) &&
      (!isImpersonating || !impersonationSession?.actions_disabled),
    deleteLeads: agency.canDeleteLeads &&
      (!isImpersonating || !impersonationSession?.actions_disabled),
    exportLeads: platform.canExportLeads,

    // Admin access
    accessAdminPanel: isPlatformUser,
    accessAgencyPanel: agency.canViewLeads,

    // Newsroom access
    createStories: platform.canManageNewsroom,
    publishStories: platform.canPublishStories,

    // User management
    manageAgencyMembers: agency.canInviteMembers || platform.canManageUsers,

    // Routing
    manageRouting: agency.canManageRouting || platform.canManageRoutingRules,

    // Write actions (blocked during read-only impersonation)
    performWriteActions: !isImpersonating || !impersonationSession?.actions_disabled ||
      platformRole === 'platform_master_admin'
  }), [platform, agency, isPlatformUser, isImpersonating, impersonationSession, platformRole]);

  // Check permission for specific agency
  const hasAgencyPermission = (agencyId, requiredRole) => {
    return hasAgencyRole(requiredRole, agencyId);
  };

  // Check if user can access a specific lead
  const canAccessLead = (leadAgencyId) => {
    // Platform support/admin can view any lead
    if (platform.canViewLeads) return true;
    // Agency users can only access their agency's leads
    return agencyMemberships.some(m =>
      m.agency_id === leadAgencyId && m.status === 'active'
    );
  };

  // Check if user can modify a specific lead
  const canModifyLead = (leadAgencyId) => {
    // Must be able to perform write actions
    if (!can.performWriteActions) return false;
    // Platform master admin can modify any lead
    if (platform.canUpdateLeads) return true;
    // Agency producers+ can modify their agency's leads
    return hasAgencyRole('producer', leadAgencyId);
  };

  return {
    // User state
    isAuthenticated: !!user,
    isPlatformUser,
    isImpersonating,

    // Plane-specific permissions
    platform,
    agency,

    // Combined permissions
    can,

    // Helper functions
    hasAgencyPermission,
    canAccessLead,
    canModifyLead,
    hasPlatformRole,
    hasAgencyRole
  };
}

/**
 * Permission constants for reference
 */
export const PLATFORM_ROLES = [
  'platform_master_admin',
  'platform_admin',
  'platform_support',
  'platform_editor',
  'platform_auditor'
];

// Active agency roles (Allstate terminology)
export const AGENCY_ROLES = ['agent', 'producer'];

// Future agency roles (schema supports these)
export const AGENCY_ROLES_FUTURE = ['agent', 'manager', 'producer', 'viewer'];

/**
 * Audit event types for admin actions
 */
export const ADMIN_AUDIT_EVENTS = {
  VIEW_LEAD: 'ADMIN_VIEW_LEAD',
  EXPORT_LEADS: 'ADMIN_EXPORT_LEADS',
  REASSIGN_LEAD: 'ADMIN_REASSIGN_LEAD',
  IMPERSONATE_USER: 'ADMIN_IMPERSONATE_USER',
  END_IMPERSONATION: 'ADMIN_END_IMPERSONATION',
  UPDATE_AGENCY_STATUS: 'ADMIN_UPDATE_AGENCY_STATUS',
  CREATE_ROUTING_RULE: 'ADMIN_CREATE_ROUTING_RULE',
  UPDATE_ROUTING_RULE: 'ADMIN_UPDATE_ROUTING_RULE',
  DELETE_ROUTING_RULE: 'ADMIN_DELETE_ROUTING_RULE'
};

export default usePermissions;
