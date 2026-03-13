// src/pages/EmployeeRosterPage.jsx
// Employee Roster — central employee management page.
// Route: /admin/agency/employees
// Access: platform_admin, platform_master_admin

import { useState, useMemo } from 'react';
import { Users, Plus, RefreshCw, AlertCircle, Edit2, UserX, ShieldCheck } from 'lucide-react';
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
  service: 'Service',
  producer: 'Producer',
  admin: 'Admin',
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{error.message}</p>
          <button
            onClick={() => refetch()}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors mx-auto"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Employee Roster</h1>
                <p className="text-gray-600 text-sm">Manage team members, roles, and verification</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleAddOpen}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
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
            msg.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {msg.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
            {msg.text}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-green-50 rounded-lg border border-green-100 p-4">
            <div className="text-2xl font-bold text-green-700">{activeCount}</div>
            <div className="text-sm text-green-600">Active Employees</div>
          </div>
          <div className="bg-yellow-50 rounded-lg border border-yellow-100 p-4">
            <div className="text-2xl font-bold text-yellow-700">{onLeaveCount}</div>
            <div className="text-sm text-yellow-600">On Leave</div>
          </div>
          <div className={`rounded-lg border p-4 ${
            verificationDueCount > 0
              ? 'bg-red-50 border-red-100'
              : 'bg-gray-50 border-gray-200'
          }`}>
            <div className={`text-2xl font-bold ${verificationDueCount > 0 ? 'text-red-700' : 'text-gray-500'}`}>
              {verificationDueCount}
            </div>
            <div className={`text-sm ${verificationDueCount > 0 ? 'text-red-600' : 'text-gray-500'}`}>
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
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Employee table */}
        {isLoading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
            <p className="text-gray-600 text-sm">Loading employees...</p>
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No employees found</h2>
            <p className="text-gray-600">
              {statusFilter === 'all'
                ? 'Add your first employee to get started.'
                : `No employees with status "${statusFilter}".`}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Allstate Bind ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Hired</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Last Verified</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
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
                            ? 'bg-gray-50 text-gray-400'
                            : 'hover:bg-gray-50'
                        }
                      >
                        <td className="px-4 py-3">
                          <span className={isTerminated ? 'line-through' : 'font-medium text-gray-900'}>
                            {displayName} {emp.last_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {ROLE_LABELS[emp.role_type] || emp.role_type}
                        </td>
                        <td className="px-4 py-3">
                          {emp.employment_status === 'active' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                              Active
                            </span>
                          )}
                          {emp.employment_status === 'on_leave' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                              On Leave
                            </span>
                          )}
                          {emp.employment_status === 'terminated' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                              Terminated
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                          {emp.allstate_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(emp.hire_date)}
                        </td>
                        <td className="px-4 py-3">
                          {emp.last_verified_at ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600'}>
                              {isOverdue
                                ? `${verificationDays}d ago`
                                : formatDate(emp.last_verified_at)}
                            </span>
                          ) : (
                            <span className="text-red-600 font-medium">Never</span>
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
                                  className="text-gray-500 hover:text-blue-600 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() =>
                                    verifyingId === emp.id
                                      ? setVerifyingId(null)
                                      : setVerifyingId(emp.id)
                                  }
                                  className={`transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center ${
                                    isOverdue
                                      ? 'text-red-500 hover:text-red-700'
                                      : 'text-gray-500 hover:text-green-600'
                                  }`}
                                  title="Verify"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setTerminateTarget(emp)}
                                  className="text-gray-400 hover:text-red-600 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
                                  title="Terminate"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {isTerminated && (
                              <button
                                onClick={() => handleEditOpen(emp)}
                                className="text-gray-400 hover:text-gray-600 transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
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
