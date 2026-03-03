// src/pages/AdminTimeAttendancePage.jsx
// Admin Time & Attendance Dashboard (standalone — CS Performance split to its own page)
// Route: /admin/time-attendance

import { useState, useMemo } from 'react';
import { Clock, Users, Download, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { usePermissions } from '../hooks/usePermissions';
import { useTimeEntries, useRCData, useAllEmployees, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { supabase } from '../lib/supabase';
import WeeklyTimeTable from './components/time-attendance/WeeklyTimeTable';
import DiscrepancyAlerts from './components/time-attendance/DiscrepancyAlerts';

// ── Helpers ────────────────────────────────────────────────────────────────────

function toMonday(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function addWeeks(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}

function formatWeekLabel(weekStart) {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}

function exportToCSV(entries, weekStart) {
  const headers = ['Date', 'Location', 'Code', 'Start', 'Lunch Out', 'Lunch In', 'End', 'Break (min)', 'Hours Worked', 'Notes', 'Approved'];
  const rows = entries.map((e) => [
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
    e.approved ? 'Yes' : 'No',
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `time-entries-${weekStart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Page Component ─────────────────────────────────────────────────────────────

const AdminTimeAttendancePage = () => {
  const { platform } = usePermissions();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('all');

  // ── React Query hooks (shared cache keys with CS Performance page) ─────────

  const {
    data: timeData,
    isLoading: entriesLoading,
    error: entriesError,
    refetch: refetchEntries,
  } = useTimeEntries(weekStart, selectedEmployee);

  const {
    data: rcData = [],
    refetch: refetchRC,
  } = useRCData(weekStart, selectedEmployee);

  const { data: allEmployees = [] } = useAllEmployees();
  const { invalidateTimeEntries } = useInvalidateTimeData();

  const entries = timeData?.entries || [];
  const employees = timeData?.employees || [];
  const isLoading = entriesLoading;
  const error = entriesError;

  function refetchAll() {
    refetchEntries();
    refetchRC();
  }

  // ── Approval Toggle (optimistic update via direct mutation + invalidate) ────

  async function toggleApproval(entryId, approved) {
    const { error } = await supabase
      .from('employee_time_entries')
      .update({ approved })
      .eq('id', entryId);

    if (error) {
      console.error('Failed to update approval:', error);
    }
    // Invalidate to refetch and reconcile
    invalidateTimeEntries(weekStart, selectedEmployee);
  }

  async function bulkApproval(entryIds, approved) {
    if (!entryIds || entryIds.length === 0) return;

    const { error } = await supabase
      .from('employee_time_entries')
      .update({ approved })
      .in('id', entryIds);

    if (error) {
      console.error('Failed to bulk update approval:', error);
    }
    invalidateTimeEntries(weekStart, selectedEmployee);
  }

  // ── Employee name resolver ─────────────────────────────────────────────────

  function getEmployeeName(userId) {
    const profile = employees.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || userId.substring(0, 8);
  }

  // ── Group entries by employee ──────────────────────────────────────────────

  const groupedEntries = useMemo(() => {
    const groups = {};
    entries.forEach((e) => {
      if (!groups[e.employee_user_id]) groups[e.employee_user_id] = [];
      groups[e.employee_user_id].push(e);
    });
    return groups;
  }, [entries]);

  // ── Employee dropdown options ──────────────────────────────────────────────

  const employeeOptions = allEmployees.length > 0 ? allEmployees : employees;

  // ── Permission Check ───────────────────────────────────────────────────────

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

  // ── Loading / Error States ─────────────────────────────────────────────────

  if (isLoading && entries.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading time entries...</p>
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
                <h1 className="text-2xl font-bold text-gray-900">Time & Attendance</h1>
                <p className="text-gray-600 text-sm">Employee time tracking and approval</p>
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

      {/* Filters bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
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

          {/* Employee filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Employees</option>
              {employeeOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name || emp.email || emp.id.substring(0, 8)}
                </option>
              ))}
            </select>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="text-2xl font-bold text-gray-900">{entries.length}</div>
              <div className="text-sm text-gray-600">Total Entries</div>
            </div>
            <div className="bg-blue-50 rounded-lg border border-blue-100 p-4">
              <div className="text-2xl font-bold text-blue-700">
                {entries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0).toFixed(1)}h
              </div>
              <div className="text-sm text-blue-600">Total Hours</div>
            </div>
            <div className="bg-green-50 rounded-lg border border-green-100 p-4">
              <div className="text-2xl font-bold text-green-700">
                {entries.filter((e) => e.approved).length}
              </div>
              <div className="text-sm text-green-600">Approved</div>
            </div>
            <div className="bg-yellow-50 rounded-lg border border-yellow-100 p-4">
              <div className="text-2xl font-bold text-yellow-700">
                {entries.filter((e) => !e.approved).length}
              </div>
              <div className="text-sm text-yellow-600">Pending</div>
            </div>
          </div>

          {/* Entries by employee */}
          {Object.keys(groupedEntries).length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No time entries</h2>
              <p className="text-gray-600">No entries have been logged for this week.</p>
            </div>
          ) : (
            Object.entries(groupedEntries).map(([userId, userEntries]) => (
              <div key={userId}>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5 text-gray-400" />
                  {getEmployeeName(userId)}
                </h3>

                {/* Cross-check alerts for this employee */}
                <div className="mb-4">
                  <DiscrepancyAlerts
                    timeEntries={userEntries}
                    rcData={rcData.find((r) => r.employee_user_id === userId)}
                    weekStart={weekStart}
                  />
                </div>

                <WeeklyTimeTable
                  entries={userEntries}
                  onToggleApproval={toggleApproval}
                  onBulkApproval={bulkApproval}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTimeAttendancePage;
