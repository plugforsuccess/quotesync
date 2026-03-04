// src/pages/AdminTimeAttendancePage.jsx
// Admin Attendance Page — Cameron enters weekly time for each employee.
// No employee self-service, no approval workflow. Admin-only data entry.
// Route: /admin/time-attendance

import { useState, useMemo } from 'react';
import { Clock, Users, Download, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../contexts/AuthContext';
import { useTimeEntries, useRCData, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useActiveEmployees } from '../hooks/useEmployees';
import WeeklyTimeTable from './components/time-attendance/WeeklyTimeTable';
import DiscrepancyAlerts from './components/time-attendance/DiscrepancyAlerts';

// ── Helpers ────────────────────────────────────────────────────────────────────

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toMonday(d) {
  const date = typeof d === 'string' ? new Date(d + 'T00:00:00') : new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return toLocalDateStr(date);
}

function addWeeks(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 7 * n);
  return toLocalDateStr(d);
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Mon–Fri
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function exportToCSV(entries, weekStart) {
  const headers = ['Employee', 'Date', 'Location', 'Code', 'Start', 'Lunch Out', 'Lunch In', 'End', 'Break (min)', 'Hours Worked', 'Notes'];
  const rows = entries.map((e) => [
    e.employee_user_id,
    e.work_date,
    e.location,
    e.code,
    e.start_time || '',
    e.lunch_out || '',
    e.lunch_in || '',
    e.end_time || '',
    e.unpaid_break_minutes,
    e.hours_worked || '',
    (e.notes || '').replace(/,/g, ';'),
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attendance-${weekStart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page Component ─────────────────────────────────────────────────────────────

const AdminTimeAttendancePage = () => {
  const { platform, agency } = usePermissions();
  const { currentAgencyId } = useAuth();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // ── Data hooks ────────────────────────────────────────────────────────────

  // Active employees from the employees table (for dropdown + name resolution)
  const { data: rosterEmployees = [] } = useActiveEmployees(currentAgencyId);

  const {
    data: timeData,
    isLoading: entriesLoading,
    error: entriesError,
    refetch: refetchEntries,
  } = useTimeEntries(weekStart, selectedEmployee || 'all');

  const {
    data: rcData = [],
    refetch: refetchRC,
  } = useRCData(weekStart, selectedEmployee || 'all');

  const { invalidateTimeEntries } = useInvalidateTimeData();

  const entries = timeData?.entries || [];
  const isLoading = entriesLoading;
  const error = entriesError;

  // Entries for the selected employee/week (for the editable table)
  const selectedEntries = useMemo(() => {
    if (!selectedEmployee) return [];
    return entries.filter((e) => e.employee_user_id === selectedEmployee);
  }, [entries, selectedEmployee]);

  // RC data for the selected employee
  const selectedRC = useMemo(() => {
    if (!selectedEmployee) return null;
    return rcData.find((r) => r.employee_user_id === selectedEmployee) || null;
  }, [rcData, selectedEmployee]);

  function refetchAll() {
    refetchEntries();
    refetchRC();
  }

  function handleSaved() {
    invalidateTimeEntries(weekStart, selectedEmployee);
    invalidateTimeEntries(weekStart, 'all');
  }

  // ── Summary stats (all employees for the week) ────────────────────────────

  const totalEntries = entries.length;
  const totalHours = entries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
  const employeesWithEntries = new Set(entries.map((e) => e.employee_user_id)).size;

  // ── Get employee name ─────────────────────────────────────────────────────
  // Use roster employees (employees table) for dropdown display
  const dropdownEmployees = rosterEmployees;

  function getEmployeeName(id) {
    // Check roster employees first
    const roster = rosterEmployees.find((e) => e.id === id || e.auth_user_id === id);
    if (roster) return roster.preferred_name || roster.first_name + ' ' + roster.last_name;
    return id?.substring(0, 8) || '';
  }

  // Look up the selected employee's schedule defaults
  const selectedEmployeeData = useMemo(() => {
    if (!selectedEmployee) return null;
    return rosterEmployees.find((e) => e.auth_user_id === selectedEmployee || e.id === selectedEmployee) || null;
  }, [selectedEmployee, rosterEmployees]);

  // orgId for upserts — prefer currentAgencyId from auth context
  const orgId = currentAgencyId || agency.currentAgencyId || '';

  // ── Permission Check ─────────────────────────────────────────────────────

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

  // ── Loading / Error States ───────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Failed to Load</h2>
          <p className="text-gray-600 mb-6">{error.message}</p>
          <button
            onClick={refetchAll}
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
              <Clock className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Time &amp; Attendance</h1>
                <p className="text-gray-600 text-sm">Weekly time entry for all employees</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refetchAll}
                disabled={isLoading}
                className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              {entries.length > 0 && (
                <button
                  onClick={() => exportToCSV(entries, weekStart)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls bar: Employee selector + Week navigator */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Employee selector */}
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500 min-w-[200px]"
            >
              <option value="">Select Employee...</option>
              {dropdownEmployees.map((emp) => (
                <option key={emp.id} value={emp.auth_user_id || emp.id}>
                  {emp.preferred_name || emp.first_name
                    ? `${emp.preferred_name || emp.first_name} ${emp.last_name || ''}`
                    : emp.full_name || emp.email || emp.id.substring(0, 8)}
                </option>
              ))}
            </select>
          </div>

          {/* Week selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, -1))}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-gray-900 min-w-[200px] text-center">
              {formatWeekLabel(weekStart)}
            </span>
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Quick jump to current week */}
          <button
            onClick={() => setWeekStart(toMonday(new Date()))}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            This Week
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{totalEntries}</div>
              <div className="text-sm text-gray-600">Total Entries</div>
            </div>
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
              <div className="text-2xl font-bold text-blue-700">
                {totalHours.toFixed(1)}h
              </div>
              <div className="text-sm text-blue-600">Total Hours</div>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-100 p-4">
              <div className="text-2xl font-bold text-green-700">
                {employeesWithEntries} / {rosterEmployees.length}
              </div>
              <div className="text-sm text-green-600">Employees Entered</div>
            </div>
          </div>

          {/* Editable weekly table for selected employee */}
          {!selectedEmployee ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Select an employee</h2>
              <p className="text-gray-600">Choose an employee from the dropdown above to enter their weekly time.</p>
            </div>
          ) : (
            <>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-400" />
                  {getEmployeeName(selectedEmployee)}
                  <span className="text-sm font-normal text-gray-500">
                    &middot; Week of {formatWeekLabel(weekStart)}
                  </span>
                </h3>

                {/* Discrepancy alerts */}
                {selectedRC && (
                  <div className="mb-4">
                    <DiscrepancyAlerts
                      timeEntries={selectedEntries}
                      rcData={selectedRC}
                      weekStart={weekStart}
                    />
                  </div>
                )}

                {isLoading ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-3" />
                    <p className="text-gray-600 text-sm">Loading entries...</p>
                  </div>
                ) : (
                  <WeeklyTimeTable
                    weekStart={weekStart}
                    employeeId={selectedEmployee}
                    orgId={orgId}
                    existingEntries={selectedEntries}
                    onSaved={handleSaved}
                    employeeDefaults={selectedEmployeeData}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTimeAttendancePage;
