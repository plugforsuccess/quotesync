# Two-Plane RBAC Design

QuoteSync uses a two-plane access model that separates platform (internal) and tenant (agency) concerns.

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PLATFORM PLANE                          │
│                   (Internal Staff)                          │
├─────────────────────────────────────────────────────────────┤
│  platform_master_admin  │  Full control, rare              │
│  platform_admin         │  Manage agencies, routing, users │
│  platform_support       │  View leads for troubleshooting  │
│  platform_editor        │  Newsroom only, NO lead access   │
│  platform_auditor       │  Read-only logs & compliance     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     TENANT PLANE                            │
│                 (Agency Users - per agency_id)              │
├─────────────────────────────────────────────────────────────┤
│  owner   │  Full agency control                            │
│  agent   │  Work leads (view, update)                      │
└─────────────────────────────────────────────────────────────┘
```

## Platform Roles

| Role | Leads | Agencies | Routing | Newsroom | Audit | Users |
|------|-------|----------|---------|----------|-------|-------|
| `platform_master_admin` | Full | Full | Full | Full | Full | Full |
| `platform_admin` | Read | Full | Full | Full | Read | Full |
| `platform_support` | Read (masked PII) | Read | Read | - | Read | - |
| `platform_editor` | **None** | - | - | Full | - | - |
| `platform_auditor` | - | - | - | - | Read | - |

### Key Rule: Editors Never Touch Leads

`platform_editor` has zero access to:
- `leads` table
- `lead_quotes` table
- Consumer PII

This is enforced at the RLS policy level.

## Agency Roles

| Role | View Leads | Update Leads | Delete Leads | Routing | Members | Settings |
|------|------------|--------------|--------------|---------|---------|----------|
| `owner` | Yes | Yes | Yes | Yes | Yes | Yes |
| `agent` | Yes | Yes | - | - | - | - |

### Key Rule: Agency Users Only See Their Agency

All agency queries are scoped by `agency_id`. Users cannot see other agencies' data.

## Database Schema

### Profiles (updated)

```sql
profiles
├── id (UUID, references auth.users)
├── email
├── full_name
├── role (legacy: editor/admin)
├── platform_role (platform_master_admin, platform_admin, etc.)
├── is_platform_user (boolean)
└── created_at
```

### Agency Memberships (new)

```sql
agency_memberships
├── id (UUID)
├── user_id (references auth.users)
├── agency_id (references agencies)
├── agency_role (owner, agent)
├── status (active, suspended, pending_invite)
├── invited_by (references auth.users)
├── created_at
└── updated_at
```

### Impersonation Sessions (new)

```sql
impersonation_sessions
├── id (UUID)
├── admin_user_id
├── target_user_id
├── target_agency_id
├── reason (required)
├── started_at
├── ended_at
├── is_active
├── actions_disabled (default: true)
└── metadata (JSONB)
```

## Frontend Usage

### usePermissions Hook

```jsx
import { usePermissions } from '../hooks/usePermissions';

function MyComponent() {
  const { platform, agency, can, isImpersonating } = usePermissions();

  // Platform checks
  if (platform.isAdmin) { /* ... */ }
  if (platform.canManageAgencies) { /* ... */ }

  // Agency checks
  if (agency.isOwner) { /* ... */ }
  if (agency.canUpdateLeads) { /* ... */ }

  // Combined checks
  if (can.viewLeads) { /* platform OR agency access */ }
  if (can.performWriteActions) { /* not blocked by impersonation */ }
}
```

### useAuth Hook

```jsx
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const {
    isPlatformUser,
    platformRole,
    agencyMemberships,
    currentAgencyId,
    currentAgencyRole,
    hasPlatformRole,
    hasAgencyRole,
    startImpersonation,
    endImpersonation
  } = useAuth();

  // Check specific role
  if (hasPlatformRole('platform_admin')) { /* ... */ }
  if (hasAgencyRole('owner')) { /* ... */ }
}
```

### Route Protection

```jsx
import ProtectedRoute, { PlatformRoute, AgencyRoute } from './components/ProtectedRoute';

// Platform-only route
<PlatformRoute requiredRole="platform_admin">
  <AdminAgenciesPage />
</PlatformRoute>

// Agency-only route
<AgencyRoute requiredRole="owner">
  <AgencySettingsPage />
</AgencyRoute>

// Legacy (backward compatible)
<ProtectedRoute requiredRole="admin">
  <OldAdminPage />
</ProtectedRoute>
```

## URL Structure

```
Platform UI (internal)
/admin                      # Dashboard
/admin/agencies             # All agencies
/admin/agencies/:id         # Agency detail
/admin/agencies/:id/leads   # Agency leads (read-only)
/admin/newsroom             # Editorial
/admin/audit                # Audit logs

Agency UI (external)
/agency                     # Dashboard
/agency/leads               # Their leads
/agency/leads/:id           # Lead detail
/agency/team                # Members (owner only)
/agency/settings            # Settings (owner only)
```

## Impersonation

Platform admins can impersonate agency users for troubleshooting.

### Starting Impersonation

```jsx
const { startImpersonation } = useAuth();

await startImpersonation(
  targetUserId,           // UUID of user to impersonate
  'Troubleshooting #1234', // Required reason
  false                    // actions enabled (default: false = read-only)
);
```

### During Impersonation

- Red banner displayed: "IMPERSONATING - actions logged"
- Write actions disabled by default
- All actions logged to `audit_log`

### Ending Impersonation

```jsx
const { endImpersonation } = useAuth();
await endImpersonation();
```

## Audit Logging

All admin actions are logged:

| Event Type | Description |
|------------|-------------|
| `ADMIN_VIEW_LEAD` | Admin viewed a lead |
| `ADMIN_EXPORT_LEADS` | Admin exported leads |
| `ADMIN_REASSIGN_LEAD` | Admin reassigned a lead |
| `ADMIN_IMPERSONATE_USER` | Admin started impersonation |
| `ADMIN_END_IMPERSONATION` | Admin ended impersonation |

### Logging an Action

```jsx
import { logAdminAction } from '../lib/supabase';

await logAdminAction(
  'ADMIN_VIEW_LEAD',
  agencyId,
  leadId,
  { reason: 'Support ticket #1234' }
);
```

## Database Helper Functions

These functions are used in RLS policies:

| Function | Description |
|----------|-------------|
| `is_platform_admin()` | Check if user is platform_admin+ |
| `is_platform_support()` | Check if user is platform_support+ |
| `is_platform_editor()` | Check if user is platform_editor+ |
| `has_agency_role(agency_id, role)` | Check agency role |
| `get_user_agency_ids()` | Get user's agency IDs |
| `is_impersonating()` | Check if in impersonation session |

## Future Expansion

The schema supports additional roles not yet enabled:

**Agency roles (add when needed):**
- `manager` - Lead routing, user management
- `viewer` - Read-only access

To enable, update the frontend hierarchy constants in:
- `src/contexts/AuthContext.jsx`
- `src/hooks/usePermissions.js`
- `src/lib/supabase.js`

No database migration needed - enum already supports these values.
