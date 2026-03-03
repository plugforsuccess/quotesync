// src/pages/CSPerformancePage.jsx
// CS Performance Dashboard (standalone — split from AdminTimeAttendancePage)
// Route: /admin/cs-performance
// Access: platform_master_admin, platform_admin, agency_admin (agent) only

import { useState, useMemo } from 'react';
import { BarChart3, Users, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTimeEntries, useRCData, useAllEmployees, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useInvalidateAlertCount } from '../hooks/useAlertCount';
import RCUploadForm from './components/time-attendance/RCUploadForm';
import CSScorecard from './components/time-attendance/CSScorecard';
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

// ── Page Component ─────────────────────────────────────────────────────────────

const CSPerformancePage = () => {
  const { user } = useAuth();
  const { platform } = usePermissions();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('all');

  // ── React Query hooks (shared cache keys with T&A page) ────────────────────

  const {
    data: timeData,
    isLoading: entriesLoading,
    error: entriesError,
    refetch: refetchEntries,
  } = useTimeEntries(weekStart, selectedEmployee);

  const {
    data: rcData = [],
    isLoading: rcLoading,
    refetch: refetchRC,
  } = useRCData(weekStart, selectedEmployee);

  const { data: allEmployees = [] } = useAllEmployees();
  const { invalidateRCData } = useInvalidateTimeData();
  const { invalidateAlertCount } = useInvalidateAlertCount();

  const entries = timeData?.entries || [];
  const employees = timeData?.employees || [];
  const isLoading = entriesLoading || rcLoading;
  const error = entriesError;

  function refetchAll() {
    refetchEntries();
    refetchRC();
  }

  // ── Employee name resolver ─────────────────────────────────────────────────

  function getEmployeeName(userId) {
    const profile = employees.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || userId.substring(0, 8);
  }

  // ── Employee map for RC upload (name → user_id) ────────────────────────────

  const employeeMap = useMemo(() => {
    const map = {};
    // Use allEmployees for the upload mapping (broader set than just those with entries)
    const source = allEmployees.length > 0 ? allEmployees : employees;
    source.forEach((p) => {
      if (p.full_name) map[p.full_name] = p.id;
      if (p.email) map[p.email] = p.id;
    });
    return map;
  }, [allEmployees, employees]);

  // ── Employee dropdown options ──────────────────────────────────────────────

  const employeeOptions = allEmployees.length > 0 ? allEmployees : employees;

  // ── RC upload callback — invalidate cache so both pages see fresh data ─────

  function handleRCUploaded() {
    invalidateRCData(weekStart, selectedEmployee);
    // Alert count will update after the edge function runs detection (fire-and-forget)
    // Add a short delay to let the edge function process, then invalidate badge count
    setTimeout(() => invalidateAlertCount(), 3000);
  }

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

  if (isLoading && entries.length === 0 && rcData.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
          <p className="text-gray-600">Loading performance data...</p>
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
              <BarChart3 className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">CS Performance Dashboard</h1>
                <p className="text-gray-600 text-sm">RingCentral metrics, scorecards, and discrepancy alerts</p>
              </div>
            </div>
            <button
              onClick={refetchAll}
              disabled={isLoading}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
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

          {/* Employee filter (CS reps) */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <select
              value={selectedEmployee}
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All CS Reps</option>
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
          {/* RC Upload */}
          <RCUploadForm
            orgId={user?.id}
            weekStart={weekStart}
            employeeMap={employeeMap}
            onUploaded={handleRCUploaded}
          />

          {/* Scorecards */}
          {rcData.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
              <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No performance data</h2>
              <p className="text-gray-600">Upload RingCentral CSV data to see the scorecard.</p>
            </div>
          ) : (
            rcData.map((rc) => {
              const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
              const daysWorked = empEntries.filter((e) => ['REG', 'WFH'].includes(e.code)).length;

              return (
                <div key={rc.id} className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-gray-400" />
                    {rc.employee_name || getEmployeeName(rc.employee_user_id)}
                  </h3>

                  {/* Cross-check alerts */}
                  <DiscrepancyAlerts
                    timeEntries={empEntries}
                    rcData={rc}
                    weekStart={weekStart}
                    employeeId={rc.employee_user_id}
                  />

                  <CSScorecard rcData={rc} daysWorked={daysWorked || 5} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default CSPerformancePage;
