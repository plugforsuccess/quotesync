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
  const activeAgentCount = employees.filter(
    e => e.agency_role === 'agent' && e.membership_status === 'active'
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Team Members</h1>
              <p className="text-gray-500">Manage your agency team</p>
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
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Invite Team Member</h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="producer">Producer</option>
                  <option value="agent">Agent</option>
                </select>
              </div>
              {inviteError && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
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
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Team Members Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Team ({employees.length})</h2>
          </div>
          {employees.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No active employees.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform Access</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {employees.map((emp) => {
                  const access = hasAccess(emp);
                  const pending = isPending(emp);
                  const isOwner = emp.agency_role === 'agent' && activeAgentCount <= 1;
                  const isSelf = emp.auth_user_id === user?.id;

                  return (
                    <tr key={emp.employee_id}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{getEmployeeName(emp)}</p>
                          {emp.email && (
                            <p className="text-sm text-gray-500">{emp.email}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          emp.roles?.includes('admin') || emp.agency_role === 'agent'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {emp.agency_role === 'agent' ? 'Agent' : emp.roles?.includes('admin') ? 'Admin' : emp.roles?.includes('sales') ? 'Sales' : emp.roles?.includes('service_inbound') && emp.roles?.includes('service_outbound') ? 'Service (Both)' : emp.roles?.includes('service_outbound') ? 'Service — Outbound' : emp.roles?.includes('service_inbound') ? 'Service — Inbound' : emp.roles?.includes('service') ? 'Service' : 'Staff'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {access ? (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                            Active
                          </span>
                        ) : pending ? (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            Pending
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                            No access
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        {access && isOwner ? (
                          <span className="text-xs text-gray-400" title="Can't remove the last agency owner">
                            Owner
                          </span>
                        ) : access && isSelf ? (
                          <span className="text-xs text-gray-400">You</span>
                        ) : access ? (
                          <button
                            onClick={() => handleRemove(emp.membership_id)}
                            disabled={removeMember.isPending}
                            className="text-red-500 hover:text-red-700 p-1 rounded disabled:opacity-50"
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
                            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-medium"
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
