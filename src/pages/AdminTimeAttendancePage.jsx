// src/pages/AdminTimeAttendancePage.jsx
// Admin Attendance Page — Cameron enters weekly time for each employee.
// No employee self-service, no approval workflow. Admin-only data entry.
// Route: /admin/time-attendance

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Clock, Users, Download, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { usePermissions } from '../hooks/usePermissions';
import { useAuth } from '../contexts/AuthContext';
import { useTimeEntries, useRCData, useYTDEntries, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useActiveEmployees } from '../hooks/useEmployees';
import WeeklyTimeTable from './components/time-attendance/WeeklyTimeTable';
import DiscrepancyAlerts from './components/time-attendance/DiscrepancyAlerts';
import WeekPickerCalendar from './components/time-attendance/WeekPickerCalendar';

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

function calcHours(entry) {
  if (!entry.start_time || !entry.end_time) return 0;
  const [sh, sm] = entry.start_time.split(':').map(Number);
  const [eh, em] = entry.end_time.split(':').map(Number);
  const totalMin = (eh * 60 + em) - (sh * 60 + sm) - (entry.unpaid_break_minutes || 0);
  // Subtract lunch if present
  if (entry.lunch_out && entry.lunch_in) {
    const [loh, lom] = entry.lunch_out.split(':').map(Number);
    const [lih, lim] = entry.lunch_in.split(':').map(Number);
    const lunchMin = (lih * 60 + lim) - (loh * 60 + lom);
    return Math.max(0, (totalMin - lunchMin) / 60);
  }
  return Math.max(0, totalMin / 60);
}

// ── XLSX Export ────────────────────────────────────────────────────────────────

function buildWeeklyDetailSheet(entries, getEmployeeName) {
  const headers = ['Employee', 'Date', 'Day', 'Location', 'Code', 'Start', 'Lunch Out', 'Lunch In', 'End', 'Break (min)', 'Hours Worked', 'Notes'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const rows = entries.map((e) => {
    const d = new Date(e.work_date + 'T00:00:00');
    const hours = parseFloat(e.hours_worked) || calcHours(e);
    return [
      getEmployeeName(e.employee_user_id),
      e.work_date,
      dayNames[d.getDay()],
      e.location,
      e.code,
      e.start_time || '',
      e.lunch_out || '',
      e.lunch_in || '',
      e.end_time || '',
      e.unpaid_break_minutes || 0,
      Math.round(hours * 100) / 100,
      e.notes || '',
    ];
  });
  return [headers, ...rows];
}

function buildWeeklySummarySheet(entries, getEmployeeName) {
  const headers = ['Employee', 'Total Hours', 'Days Worked', 'REG Days', 'WFH Days', 'PTO Days', 'Sick Days', 'Partial/Appt/Early Days', 'Avg Hours/Day'];
  const byEmployee = {};
  for (const e of entries) {
    if (!byEmployee[e.employee_user_id]) byEmployee[e.employee_user_id] = [];
    byEmployee[e.employee_user_id].push(e);
  }
  const rows = Object.entries(byEmployee).map(([id, empEntries]) => {
    const totalHours = empEntries.reduce((s, e) => s + (parseFloat(e.hours_worked) || calcHours(e)), 0);
    const daysWorked = empEntries.filter((e) => !['PTO', 'SICK'].includes(e.code)).length;
    const reg = empEntries.filter((e) => e.code === 'REG').length;
    const wfh = empEntries.filter((e) => e.code === 'WFH').length;
    const pto = empEntries.filter((e) => e.code === 'PTO').length;
    const sick = empEntries.filter((e) => e.code === 'SICK').length;
    const other = empEntries.filter((e) => ['SICK_PART', 'APPT', 'EARLY'].includes(e.code)).length;
    const avg = daysWorked > 0 ? totalHours / daysWorked : 0;
    return [
      getEmployeeName(id),
      Math.round(totalHours * 100) / 100,
      daysWorked,
      reg,
      wfh,
      pto,
      sick,
      other,
      Math.round(avg * 100) / 100,
    ];
  });
  return [headers, ...rows];
}

function buildYTDSheet(ytdEntries, getEmployeeName, year) {
  const headers = ['Employee', 'Year', 'Total Hours', 'Days Worked', 'REG Days', 'WFH Days', 'PTO Days Used', 'Sick Days Used', 'Partial/Appt/Early', 'Avg Hours/Week', 'Weeks Entered'];
  const byEmployee = {};
  for (const e of ytdEntries) {
    if (!byEmployee[e.employee_user_id]) byEmployee[e.employee_user_id] = [];
    byEmployee[e.employee_user_id].push(e);
  }
  const rows = Object.entries(byEmployee).map(([id, empEntries]) => {
    const totalHours = empEntries.reduce((s, e) => s + (parseFloat(e.hours_worked) || calcHours(e)), 0);
    const daysWorked = empEntries.filter((e) => !['PTO', 'SICK'].includes(e.code)).length;
    const reg = empEntries.filter((e) => e.code === 'REG').length;
    const wfh = empEntries.filter((e) => e.code === 'WFH').length;
    const pto = empEntries.filter((e) => e.code === 'PTO').length;
    const sick = empEntries.filter((e) => e.code === 'SICK').length;
    const other = empEntries.filter((e) => ['SICK_PART', 'APPT', 'EARLY'].includes(e.code)).length;
    const weeksSet = new Set(empEntries.map((e) => e.week_start));
    const weeksEntered = weeksSet.size;
    const avgPerWeek = weeksEntered > 0 ? totalHours / weeksEntered : 0;
    return [
      getEmployeeName(id),
      year,
      Math.round(totalHours * 100) / 100,
      daysWorked,
      reg,
      wfh,
      pto,
      sick,
      other,
      Math.round(avgPerWeek * 100) / 100,
      weeksEntered,
    ];
  });
  return [headers, ...rows];
}

function exportToXLSX(entries, weekStart, getEmployeeName, ytdEntries, year) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Weekly Detail
  const detailData = buildWeeklyDetailSheet(entries, getEmployeeName);
  const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
  wsDetail['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 5 }, { wch: 8 }, { wch: 10 },
    { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
    { wch: 12 }, { wch: 30 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Weekly Detail');

  // Sheet 2: Weekly Summary
  const summaryData = buildWeeklySummarySheet(entries, getEmployeeName);
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Weekly Summary');

  // Sheet 3: YTD Summary (if data available)
  if (ytdEntries && ytdEntries.length > 0) {
    const ytdData = buildYTDSheet(ytdEntries, getEmployeeName, year);
    const wsYTD = XLSX.utils.aoa_to_sheet(ytdData);
    wsYTD['!cols'] = [
      { wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsYTD, `YTD ${year}`);
  }

  XLSX.writeFile(wb, `attendance-${weekStart}.xlsx`);
}

// ── Page Component ─────────────────────────────────────────────────────────────

const AdminTimeAttendancePage = () => {
  const { platform, agency } = usePermissions();
  const { currentAgencyId } = useAuth();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('');

  // Track whether YTD data should be fetched (on-demand when export clicked)
  const currentYear = new Date(weekStart + 'T00:00:00').getFullYear();
  const [ytdRequested, setYtdRequested] = useState(false);

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

  const {
    data: ytdData,
    isLoading: ytdLoading,
  } = useYTDEntries(currentYear, ytdRequested);

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

  const getEmployeeName = useCallback((id) => {
    // Check roster employees first
    const roster = rosterEmployees.find((e) => e.id === id || e.auth_user_id === id);
    if (roster) return roster.preferred_name || roster.first_name + ' ' + roster.last_name;
    return id?.substring(0, 8) || '';
  }, [rosterEmployees]);

  // Look up the selected employee's schedule defaults
  const selectedEmployeeData = useMemo(() => {
    if (!selectedEmployee) return null;
    return rosterEmployees.find((e) => e.auth_user_id === selectedEmployee || e.id === selectedEmployee) || null;
  }, [selectedEmployee, rosterEmployees]);

  // orgId for upserts — prefer currentAgencyId from auth context
  const orgId = currentAgencyId || agency.currentAgencyId || '';

  // ── Export handler ────────────────────────────────────────────────────────

  const [pendingExport, setPendingExport] = useState(false);
  const pendingExportRef = useRef(false);

  function handleExportClick() {
    if (!ytdRequested) {
      setYtdRequested(true);
      setPendingExport(true);
      pendingExportRef.current = true;
      return;
    }
    if (ytdLoading) {
      setPendingExport(true);
      pendingExportRef.current = true;
      return;
    }
    exportToXLSX(entries, weekStart, getEmployeeName, ytdData?.entries || [], currentYear);
  }

  // When YTD data arrives and an export is pending, trigger download
  useEffect(() => {
    if (pendingExportRef.current && ytdRequested && !ytdLoading && ytdData) {
      pendingExportRef.current = false;
      setPendingExport(false);
      exportToXLSX(entries, weekStart, getEmployeeName, ytdData.entries || [], currentYear);
    }
  }, [ytdRequested, ytdLoading, ytdData, entries, weekStart, getEmployeeName, currentYear]);

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
                  onClick={handleExportClick}
                  disabled={pendingExport && ytdLoading}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  title="Export XLSX with Weekly Detail, Summary, and YTD tabs"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {pendingExport && ytdLoading ? 'Preparing...' : 'Export Report'}
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

          {/* Week selector with calendar popup */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, -1))}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <WeekPickerCalendar
              weekStart={weekStart}
              onChange={setWeekStart}
              label={formatWeekLabel(weekStart)}
            />
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
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
