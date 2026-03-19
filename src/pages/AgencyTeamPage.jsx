// src/pages/AgencyTeamPage.jsx
// MT-05: Agency Team Management Page
// Shows all active employees with platform access status

import { useState } from 'react';
import { Users, UserPlus, Trash2, AlertCircle, Mail } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyTeamWithEmployees, useRemoveTeamMember, useInviteAgencyUser } from '../hooks/useAgencies';
import PageSpinner from '../components/PageSpinner';

export default function AgencyTeamPage() {
  const { currentAgencyId, user } = useAuth();
  const { data: team, isLoading } = useAgencyTeamWithEmployees(currentAgencyId);
  const removeMember = useRemoveTeamMember(currentAgencyId);
  const inviteUser = useInviteAgencyUser();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('producer');
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  if (isLoading) return <PageSpinner />;

  const employees = team || [];

  // Guard: count active agents to prevent removing the last one
  const activePrincipalCount = employees.filter(
    e => e.agency_role === 'principal' && e.membership_status === 'active'
  ).length;

  const handleRemove = async (membershipId) => {
    if (!confirm('Remove this team member? They will lose access to the agency.')) return;
    try {
      await removeMember.mutateAsync(membershipId);
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!inviteEmail.trim()) {
      setInviteError('Email is required');
      return;
    }

    try {
      const result = await inviteUser.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
        agencyId: currentAgencyId,
        actorUserId: user?.id,
      });

      if (result.invited) {
        setInviteSuccess('Invitation logged. This person will need to create a QuoteSync account. They\'ll appear as Pending until they log in.');
      } else {
        setInviteSuccess('Team member added successfully.');
      }
      setInviteEmail('');
      setInviteRole('producer');
    } catch (err) {
      setInviteError(err.message || 'Failed to invite user');
    }
  };

  const getEmployeeName = (emp) => {
    if (emp.first_name || emp.last_name) {
      return `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    }
    return emp.full_name || emp.email || 'Unknown';
  };

  const hasAccess = (emp) => !!emp.membership_id && emp.membership_status === 'active';
  const isPending = (emp) => !!emp.membership_id && emp.membership_status === 'pending';

  return (
    <div className="dark-page">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-qs-bright">Team Members</h1>
              <p className="text-qs-subtle">Manage your agency team</p>
            </div>
          </div>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Invite
          </button>
        </div>

        {/* Invite Modal/Panel */}
        {showInvite && (
          <div className="dark-card mb-6">
            <h3 className="text-lg font-semibold text-qs-bright mb-4">Invite Team Member</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="dark-label block text-sm font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="dark-input"
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label className="dark-label block text-sm font-medium mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="dark-input"
                >
                  <option value="producer">Producer</option>
                  <option value="manager">Manager</option>
                  <option value="principal">Principal</option>
                </select>
              </div>
              {inviteError && (
                <div className="flex items-center gap-2 text-red-400 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="p-3 dark-alert-green">
                  {inviteSuccess}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={inviteUser.isPending}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg disabled:opacity-50"
                >
                  {inviteUser.isPending ? 'Inviting...' : 'Send Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteError(null); setInviteSuccess(null); }}
                  className="px-4 py-2 text-qs-text hover:bg-qs-card rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Team Members Table */}
        <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
          <div className="px-6 py-4 border-b border-qs-border">
            <h2 className="font-semibold text-qs-bright">Team ({employees.length})</h2>
          </div>
          {employees.length === 0 ? (
            <div className="px-6 py-8 text-center text-qs-subtle">No active employees.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-qs-elevated">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase">Platform Access</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-qs-subtle uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-qs-border">
                {employees.map((emp) => {
                  const access = hasAccess(emp);
                  const pending = isPending(emp);
                  const isOwner = emp.agency_role === 'principal' && activePrincipalCount <= 1;
                  const isSelf = emp.auth_user_id === user?.id;

                  return (
                    <tr key={emp.employee_id}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-qs-bright">{getEmployeeName(emp)}</p>
                          {emp.email && (
                            <p className="text-sm text-qs-subtle">{emp.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          emp.roles?.includes('admin') || emp.agency_role === 'principal'
                            ? 'bg-purple-900/20 text-purple-400'
                            : 'bg-blue-900/20 text-blue-400'
                        }`}>
                          {emp.agency_role === 'principal' ? 'Principal' : emp.agency_role === 'manager' ? 'Manager' : emp.roles?.includes('admin') ? 'Admin' : emp.roles?.includes('sales') ? 'Sales' : emp.roles?.includes('service_inbound') && emp.roles?.includes('service_outbound') ? 'Service (Both)' : emp.roles?.includes('service_outbound') ? 'Service — Outbound' : emp.roles?.includes('service_inbound') ? 'Service — Inbound' : emp.roles?.includes('service') ? 'Service' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {access ? (
                          <span className="px-2 py-1 bg-emerald-900/20 text-emerald-400 rounded-full text-xs font-medium">
                            Active
                          </span>
                        ) : pending ? (
                          <span className="px-2 py-1 bg-amber-900/20 text-amber-400 rounded-full text-xs font-medium">
                            Pending
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-qs-elevated text-qs-subtle rounded-full text-xs font-medium">
                            No access
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        {access && isOwner ? (
                          <span className="text-xs text-qs-muted" title="Can't remove the last agency principal">
                            Owner
                          </span>
                        ) : access && isSelf ? (
                          <span className="text-xs text-qs-muted">You</span>
                        ) : access ? (
                          <button
                            onClick={() => handleRemove(emp.membership_id)}
                            disabled={removeMember.isPending}
                            className="text-red-400 hover:text-red-300 p-1 rounded disabled:opacity-50"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : !emp.membership_id ? (
                          <button
                            onClick={() => {
                              setInviteEmail(emp.email || '');
                              setInviteRole('producer');
                              setShowInvite(true);
                            }}
                            className="flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 font-medium"
                            title="Send platform invite"
                          >
                            <Mail className="w-4 h-4" />
                            Invite
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
