// src/pages/AgencyTeamPage.jsx
// MT-05: Agency Team Management Page
// Shows all active employees with platform access status

import { T } from '../components/SiteCopy';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus, Trash2, AlertCircle, Mail, Edit2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAgencyTeamWithEmployees, useRemoveTeamMember, useInviteAgencyUser, useUpdateMemberRole } from '../hooks/useAgencies';
import { useUpdateEmployee } from '../hooks/useEmployees';
import { supabase } from '../lib/supabase';
import EmployeeFormModal from './components/employees/EmployeeFormModal';
import PageSpinner from '../components/PageSpinner';

export default function AgencyTeamPage() {
  const queryClient = useQueryClient();
  const { currentAgencyId, user } = useAuth();
  const { data: team, isLoading } = useAgencyTeamWithEmployees(currentAgencyId);
  const removeMember = useRemoveTeamMember(currentAgencyId);
  const updateRole = useUpdateMemberRole(currentAgencyId);
  const inviteUser = useInviteAgencyUser();
  const { mutate: updateEmployee, isPending: updatingEmployee } = useUpdateEmployee();

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('producer');
  const [inviteError, setInviteError] = useState(null);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [loadingEmployee, setLoadingEmployee] = useState(false);

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

  const handleRoleChange = async (membershipId, newRole) => {
    try {
      await updateRole.mutateAsync({ membershipId, newRole });
      setEditingRoleId(null);
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  const handleEditOpen = async (emp) => {
    setLoadingEmployee(true);
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('id', emp.employee_id)
        .single();
      if (error) throw error;
      setEditingEmployee(data);
      setEditFormOpen(true);
    } catch (err) {
      console.error('Failed to load employee:', err);
    } finally {
      setLoadingEmployee(false);
    }
  };

  const handleEditSave = (payload) => {
    updateEmployee({ id: editingEmployee.id, ...payload }, {
      onSuccess: () => {
        setEditFormOpen(false);
        setEditingEmployee(null);
        queryClient.invalidateQueries({ queryKey: ['agency_team_full', currentAgencyId] });
      },
    });
  };

  const getEmployeeName = (emp) => {
    if (emp.first_name || emp.last_name) {
      return `${emp.first_name || ''} ${emp.last_name || ''}`.trim();
    }
    return emp.full_name || emp.email || 'Unknown';
  };

  const hasAccess = (emp) => !!emp.membership_id && emp.membership_status === 'active';
  const isPending = (emp) => !!emp.membership_id && emp.membership_status === 'pending';

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
      month: '2-digit', day: '2-digit', year: 'numeric',
    });
  };

  return (
    <div className="dark-page">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-primary-600" />
            <div>
              <h1 className="text-2xl font-bold text-qs-bright"><T k="pages.agencyteampage.819644">Team Members</T></h1>
              <p className="text-qs-subtle"><T k="pages.agencyteampage.064ea9">Manage your agency team</T></p>
            </div>
          </div>
          <button
            onClick={() => setShowInvite(!showInvite)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            <T k="pages.agencyteampage.c6a00f">Invite</T>
          </button>
        </div>

        {/* Invite Modal/Panel */}
        {showInvite && (
          <div className="dark-card mb-6">
            <h3 className="text-lg font-semibold text-qs-bright mb-4"><T k="pages.agencyteampage.f1ff27">Invite Team Member</T></h3>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="dark-label block text-sm font-medium mb-1"><T k="pages.agencyteampage.643a86">Email Address</T></label>
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
                <label className="dark-label block text-sm font-medium mb-1"><T k="pages.agencyteampage.bbbabd">Role</T></label>
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
                  {inviteUser.isPending ? <T k="pages.agencyteampage.dc7a6e">{'Inviting...'}</T> : <T k="pages.agencyteampage.c6b719">{'Send Invite'}</T>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowInvite(false); setInviteError(null); setInviteSuccess(null); }}
                  className="px-4 py-2 text-qs-text hover:bg-qs-card rounded-lg"
                >
                  <T k="pages.agencyteampage.ea4788">Cancel</T>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Team Members Table */}
        <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
          <div className="px-6 py-4 border-b border-qs-border">
            <h2 className="font-semibold text-qs-bright"><T k="pages.agencyteampage.512f2a">Team (</T>{employees.length})</h2>
          </div>
          {employees.length === 0 ? (
            <div className="px-6 py-8 text-center text-qs-subtle"><T k="pages.agencyteampage.012167">No active employees.</T></div>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-qs-elevated">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.49ee30">Name</T></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.bbbabd">Role</T></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.08ab35">Bind ID</T></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.04b907">Hired</T></th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.e9d512">Platform Login</T></th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-qs-subtle uppercase"><T k="pages.agencyteampage.06df33">Actions</T></th>
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
                        {editingRoleId === emp.membership_id && emp.membership_id ? (
                          <select
                            autoFocus
                            defaultValue={emp.agency_role || 'producer'}
                            onChange={(e) => handleRoleChange(emp.membership_id, e.target.value)}
                            onBlur={() => setEditingRoleId(null)}
                            disabled={updateRole.isPending}
                            className="dark-select text-xs py-1 px-2"
                          >
                            <option value="producer">Producer</option>
                            <option value="manager">Manager</option>
                            <option value="principal">Principal</option>
                          </select>
                        ) : (
                          <button
                            onClick={() => emp.membership_id && !isSelf && !isOwner ? setEditingRoleId(emp.membership_id) : null}
                            title={isSelf || isOwner ? undefined : 'Click to change role'}
                            className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              emp.agency_role === 'principal'
                                ? 'bg-purple-900/20 text-purple-400 hover:bg-purple-900/40'
                                : emp.agency_role === 'manager'
                                ? 'bg-blue-900/20 text-blue-400 hover:bg-blue-900/40'
                                : 'bg-qs-elevated text-qs-dim hover:bg-qs-border'
                            } ${(!emp.membership_id || isSelf || isOwner) ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {emp.agency_role === 'principal'
                              ? <T k="pages.agencyteampage.f3b86b">{'Principal'}</T>
                              : emp.agency_role === 'manager'
                              ? <T k="pages.agencyteampage.babe30">{'Manager'}</T>
                              : emp.roles?.includes('sales')
                              ? <T k="pages.agencyteampage.d0edfb">{'Sales'}</T>
                              : emp.roles?.includes('service_inbound') && emp.roles?.includes('service_outbound')
                              ? <T k="pages.agencyteampage.baf17c">{'Service (Both)'}</T>
                              : emp.roles?.includes('service_outbound')
                              ? <T k="pages.agencyteampage.a89ddb">{'Service — Outbound'}</T>
                              : emp.roles?.includes('service_inbound')
                              ? <T k="pages.agencyteampage.dd8220">{'Service — Inbound'}</T>
                              : <T k="pages.agencyteampage.7b7194">{'Producer'}</T>}
                          </button>
                        )}
                      </td>
                      <td className="px-6 py-4 text-qs-dim font-mono text-xs">
                        {emp.allstate_id || '—'}
                      </td>
                      <td className="px-6 py-4 text-qs-dim text-sm">
                        {formatDate(emp.hire_date)}
                      </td>
                      <td className="px-6 py-4">
                        {access ? (
                          <span className="px-2 py-1 bg-emerald-900/20 text-emerald-400 rounded-full text-xs font-medium">
                            <T k="pages.agencyteampage.4d3d76">Active</T>
                          </span>
                        ) : pending ? (
                          <span className="px-2 py-1 bg-amber-900/20 text-amber-400 rounded-full text-xs font-medium">
                            <T k="pages.agencyteampage.2d13df">Pending</T>
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-qs-elevated text-qs-subtle rounded-full text-xs font-medium">
                            <T k="pages.agencyteampage.6adf97">None</T>
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEditOpen(emp)}
                          disabled={loadingEmployee}
                          className="text-qs-subtle hover:text-primary-400 p-1 rounded transition-colors disabled:opacity-50"
                          title="Edit employee"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {access && isOwner ? (
                          <span className="text-xs text-qs-muted" title="Can't remove the last agency principal">
                            <T k="pages.agencyteampage.b6f4a2">Owner</T>
                          </span>
                        ) : access && isSelf ? (
                          <span className="text-xs text-qs-muted"><T k="pages.agencyteampage.cae8d1">You</T></span>
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
                            <T k="pages.agencyteampage.c6a00f">Invite</T>
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>

        {/* Edit Employee Modal */}
        <EmployeeFormModal
          open={editFormOpen}
          onClose={() => { setEditFormOpen(false); setEditingEmployee(null); }}
          onSave={handleEditSave}
          saving={updatingEmployee}
          employee={editingEmployee}
          agencyId={currentAgencyId}
        />
      </div>
    </div>
  );
}
