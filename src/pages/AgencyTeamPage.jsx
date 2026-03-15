// src/pages/AgencyTeamPage.jsx
// MT-05: Agency Team Management Page

import { useState } from 'react';
import { Users, UserPlus, Trash2, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyTeam, useRemoveTeamMember, useInviteAgencyUser } from '../hooks/useAgencies';
import PageSpinner from '../components/PageSpinner';

export default function AgencyTeamPage() {
  const { currentAgencyId, user } = useAuth();
  const { data: team, isLoading } = useAgencyTeam(currentAgencyId);
  const removeMember = useRemoveTeamMember(currentAgencyId);
  const inviteUser = useInviteAgencyUser();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('producer');
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);

  if (isLoading) return <PageSpinner />;

  const activeMembers = (team || []).filter(m => m.status === 'active');
  const pendingMembers = (team || []).filter(m => m.status === 'pending');
  const removedMembers = (team || []).filter(m => m.status === 'removed');

  // Guard: count active agents to prevent removing the last one
  const activeAgentCount = activeMembers.filter(m => m.agency_role === 'agent').length;

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

  const getMemberName = (member) => {
    const p = member.profiles;
    if (p?.first_name || p?.last_name) {
      return `${p.first_name || ''} ${p.last_name || ''}`.trim();
    }
    return p?.email || 'Unknown';
  };

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

        {/* Active Members */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Active Members ({activeMembers.length})</h2>
          </div>
          {activeMembers.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No active team members.</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {activeMembers.map((member) => {
                  const isOwner = member.agency_role === 'agent' && activeAgentCount <= 1;
                  const isSelf = member.user_id === user?.id;

                  return (
                    <tr key={member.id}>
                      <td className="px-6 py-4">
                        <div>
                          <p className="font-medium text-gray-900">{getMemberName(member)}</p>
                          <p className="text-sm text-gray-500">{member.profiles?.email}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          member.agency_role === 'agent'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {member.agency_role === 'agent' ? 'Agent' : 'Producer'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                          Active
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isOwner ? (
                          <span className="text-xs text-gray-400" title="Can't remove the last agency owner">
                            Owner
                          </span>
                        ) : isSelf ? (
                          <span className="text-xs text-gray-400">You</span>
                        ) : (
                          <button
                            onClick={() => handleRemove(member.id)}
                            disabled={removeMember.isPending}
                            className="text-red-500 hover:text-red-700 p-1 rounded disabled:opacity-50"
                            title="Remove member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pending Invites */}
        {pendingMembers.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Pending Invites ({pendingMembers.length})</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pendingMembers.map((member) => (
                  <tr key={member.id}>
                    <td className="px-6 py-4 text-gray-900">{member.profiles?.email || 'Unknown'}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                        {member.agency_role === 'agent' ? 'Agent' : 'Producer'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                        Pending
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRemove(member.id)}
                        disabled={removeMember.isPending}
                        className="text-red-500 hover:text-red-700 p-1 rounded disabled:opacity-50"
                        title="Cancel invite"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
