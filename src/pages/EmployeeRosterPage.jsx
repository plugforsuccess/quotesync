// src/pages/EmployeeRosterPage.jsx
// Employee Roster — central employee management page.
// Route: /admin/agency/employees
// Access: platform_admin, platform_master_admin

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, RefreshCw, ShieldOff, AlertCircle, Edit2, UserX, ShieldCheck, BarChart3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  useEmployeeRoster,
  useAddEmployee,
  useUpdateEmployee,
  useTerminateEmployee,
  useVerifyEmployee,
} from '../hooks/useEmployees';
import EmployeeFormModal from './components/employees/EmployeeFormModal';
import TerminateModal from './components/employees/TerminateModal';
import VerifyInlineForm from './components/employees/VerifyInlineForm';

const ROLE_LABELS = {
  service_inbound:  'Service — Inbound',
  service_outbound: 'Service — Outbound',
  service:          'Service',  // legacy
  sales:            'Sales',
  admin:            'Admin',
};

const STATUS_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'terminated', label: 'Terminated' },
  { value: 'all', label: 'All' },
];

function formatDate(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

const EmployeeRosterPage = () => {
  const { user, currentAgencyId } = useAuth();
  const { platform } = usePermissions();

  const [statusFilter, setStatusFilter] = useState('active');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [terminateTarget, setTerminateTarget] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [msg, setMsg] = useState(null);

  const orgId = currentAgencyId || '';

  // ── Data hooks ────────────────────────────────────────────────────────────

  const {
    data: employees = [],
    isLoading,
    error,
    refetch,
  } = useEmployeeRoster(orgId);

  const { mutate: addEmployee, isPending: adding } = useAddEmployee();
  const { mutate: updateEmployee, isPending: updating } = useUpdateEmployee();
  const { mutate: terminateEmployee, isPending: terminating } = useTerminateEmployee();
  const { mutate: verifyEmployee, isPending: verifying } = useVerifyEmployee();

  // ── Filtered + sorted employees ────────────────────────────────────────

  const filteredEmployees = useMemo(() => {
    if (statusFilter === 'all') return employees;
    return employees.filter((emp) => emp.employment_status === statusFilter);
  }, [employees, statusFilter]);

  // ── Summary counts ─────────────────────────────────────────────────────

  const activeCount = employees.filter((e) => e.employment_status === 'active').length;
  const onLeaveCount = employees.filter((e) => e.employment_status === 'on_leave').length;
  const verificationDueCount = employees.filter((e) => {
    if (e.employment_status !== 'active') return false;
    if (!e.last_verified_at) return true;
    return daysSince(e.last_verified_at) > 90;
  }).length;

  // ── Handlers ──────────────────────────────────────────────────────────

  function handleAddOpen() {
    setEditingEmployee(null);
    setFormOpen(true);
    setMsg(null);
  }

  function handleEditOpen(emp) {
    setEditingEmployee(emp);
    setFormOpen(true);
    setMsg(null);
  }

  function handleFormSave(payload) {
    if (editingEmployee) {
      updateEmployee({ id: editingEmployee.id, ...payload }, {
        onSuccess: () => {
          setFormOpen(false);
          setMsg({ type: 'success', text: 'Employee updated.' });
        },
        onError: (err) => setMsg({ type: 'error', text: err.message }),
      });
    } else {
      addEmployee({ org_id: orgId, ...payload }, {
        onSuccess: () => {
          setFormOpen(false);
          setMsg({ type: 'success', text: 'Employee added.' });
        },
        onError: (err) => setMsg({ type: 'error', text: err.message }),
      });
    }
  }

  function handleTerminate(data) {
    terminateEmployee(data, {
      onSuccess: () => {
        setTerminateTarget(null);
        setMsg({ type: 'success', text: 'Employee terminated.' });
      },
      onError: (err) => setMsg({ type: 'error', text: err.message }),
    });
  }

  function handleVerify(employeeId, notes) {
    verifyEmployee(
      { employeeId, verifiedBy: user?.id, notes },
      {
        onSuccess: () => {
          setVerifyingId(null);
          setMsg({ type: 'success', text: 'Employee verified.' });
        },
        onError: (err) => setMsg({ type: 'error', text: err.message }),
      },
    );
  }

  // ── Permission Check ─────────────────────────────────────────────────

  if (!platform.isAdmin) {
    return (
      <div className="dark-page flex items-center justify-center">
        <div className="text-center">
          <ShieldOff className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-qs-bright mb-2">Access Denied</h2>
          <p className="text-qs-dim">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dark-page flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-qs-card rounded-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-qs-bright mb-4">Failed to Load</h2>
          <p className="text-qs-dim mb-6">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark-page">
      {/* Header */}
      <div className="dark-header">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-primary-600" />
              <div>
                <h1 className="dark-heading text-2xl font-bold">Employee Roster</h1>
                <p className="dark-subheading">Manage team members, roles, and verification</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="p-2 text-qs-dim hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleAddOpen}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Employee
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Feedback message */}
        {msg && (
          <div className={`flex items-center gap-2 text-sm px-4 py-3 rounded-lg ${
            msg.type === 'error' ? 'bg-red-900/20 text-red-300 border border-red-700/40' : 'bg-emerald-900/20 text-emerald-300 border border-emerald-700/40'
          }`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            {msg.text}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="dark-card-elevated">
            <div className="text-2xl font-bold" style={{ color: '#10B981' }}>{activeCount}</div>
            <div className="text-sm text-emerald-400">Active Employees</div>
          </div>
          <div className="dark-card-elevated">
            <div className="text-2xl font-bold" style={{ color: '#F59E0B' }}>{onLeaveCount}</div>
            <div className="text-sm text-amber-400">On Leave</div>
          </div>
          <div className={`rounded-lg border p-4 ${
            verificationDueCount > 0
              ? 'bg-red-900/20 border-red-700/40'
              : 'bg-qs-elevated border-qs-border'
          }`}>
            <div className={`text-2xl font-bold ${verificationDueCount > 0 ? 'text-red-400' : 'text-qs-subtle'}`}>
              {verificationDueCount}
            </div>
            <div className={`text-sm ${verificationDueCount > 0 ? 'text-red-400' : 'text-qs-subtle'}`}>
              Verification Due
            </div>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary-900/30 text-primary-400'
                  : 'bg-qs-elevated text-qs-dim border border-qs-border hover:bg-qs-card'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Employee table */}
        {isLoading ? (
          <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3" />
            <p className="text-qs-dim text-sm">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
            <Users className="w-16 h-16 text-qs-muted mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-qs-bright mb-2">No employees found</h2>
            <p className="text-qs-dim">
              {statusFilter === 'all'
                ? 'Add your first employee to get started.'
                : `No employees with status "${statusFilter}".`}
            </p>
          </div>
        ) : (
          <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-qs-elevated border-b border-qs-border">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Allstate Bind ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Hired</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-qs-subtle uppercase tracking-wider">Last Verified</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-qs-subtle uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-qs-border">
                  {filteredEmployees.map((emp) => {
                    const isTerminated = emp.employment_status === 'terminated';
                    const displayName = emp.preferred_name || emp.first_name;
                    const verificationDays = daysSince(emp.last_verified_at);
                    const isOverdue = emp.employment_status === 'active' && (verificationDays === null || verificationDays > 90);

                    return (
                      <tr
                        key={emp.id}
                        className={
                          isTerminated
                            ? 'bg-qs-elevated text-qs-muted'
                            : 'hover:bg-qs-elevated'
                        }
                      >
                        <td className="px-4 py-3">
                          <span className={isTerminated ? 'line-through' : 'font-medium text-qs-bright'}>
                            {displayName} {emp.last_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-qs-dim">
                          {emp.roles?.map(r => ROLE_LABELS[r] || r).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {emp.employment_status === 'active' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-900/20 text-emerald-400">
                              Active
                            </span>
                          )}
                          {emp.employment_status === 'on_leave' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/20 text-amber-400">
                              On Leave
                            </span>
                          )}
                          {emp.employment_status === 'terminated' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-qs-elevated text-qs-subtle">
                              Terminated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-qs-dim font-mono text-xs">
                          {emp.allstate_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-qs-dim">
                          {formatDate(emp.hire_date)}
                        </td>
                        <td className="px-4 py-3">
                          {emp.last_verified_at ? (
                            <span className={isOverdue ? 'text-red-400 font-medium' : 'text-qs-dim'}>
                              {isOverdue
                                ? `${verificationDays}d ago`
                                : formatDate(emp.last_verified_at)}
                            </span>
                          ) : (
                            <span className="text-red-400 font-medium">Never</span>
                          )}
                          {/* Inline verify form */}
                          {verifyingId === emp.id && (
                            <VerifyInlineForm
                              onVerify={(notes) => handleVerify(emp.id, notes)}
                              saving={verifying}
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {!isTerminated && (
                              <>
                                <button
                                  onClick={() => handleEditOpen(emp)}
                                  className="text-qs-subtle hover:text-primary-400 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {emp.roles?.includes('sales') && (
                                  <Link
                                    to={`/admin/producers/${emp.id}/comp-model`}
                                    className="text-qs-subtle hover:text-primary-400 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                    title="Comp Model"
                                  >
                                    <BarChart3 className="w-4 h-4" />
                                  </Link>
                                )}
                                <button
                                  onClick={() =>
                                    verifyingId === emp.id
                                      ? setVerifyingId(null)
                                      : setVerifyingId(emp.id)
                                  }
                                  className={`transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center ${
                                    isOverdue
                                      ? 'text-red-400 hover:text-red-300'
                                      : 'text-qs-subtle hover:text-emerald-400'
                                  }`}
                                  title="Verify"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setTerminateTarget(emp)}
                                  className="text-qs-muted hover:text-red-400 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                  title="Terminate"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {isTerminated && (
                              <button
                                onClick={() => handleEditOpen(emp)}
                                className="text-qs-muted hover:text-qs-dim transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                title="View details"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <EmployeeFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
        saving={adding || updating}
        employee={editingEmployee}
        agencyId={orgId}
      />

      <TerminateModal
        open={!!terminateTarget}
        onClose={() => setTerminateTarget(null)}
        onConfirm={handleTerminate}
        saving={terminating}
        employee={terminateTarget}
      />
    </div>
  );
};

export default EmployeeRosterPage;
