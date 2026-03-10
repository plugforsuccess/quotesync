// src/pages/AdminTimeAttendancePage.jsx
// Admin Attendance Page — Cameron enters weekly time for each employee.
// No employee self-service, no approval workflow. Admin-only data entry.
// Route: /admin/time-attendance

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Clock, Users, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
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

// Calculate hours from time fields. Lunch is treated as the unpaid break
// (don't double-subtract unpaid_break_minutes when lunch times are present).
function calcHours(entry) {
  if (!entry.start_time || !entry.end_time) return 0;
  const [sh, sm] = entry.start_time.split(':').map(Number);
  const [eh, em] = entry.end_time.split(':').map(Number);
  let totalMin = (eh * 60 + em) - (sh * 60 + sm);
  if (entry.lunch_out && entry.lunch_in) {
    const [loh, lom] = entry.lunch_out.split(':').map(Number);
    const [lih, lim] = entry.lunch_in.split(':').map(Number);
    totalMin -= (lih * 60 + lim) - (loh * 60 + lom);
  } else if (entry.unpaid_break_minutes) {
    // Only subtract unpaid_break_minutes when no explicit lunch times
    totalMin -= entry.unpaid_break_minutes;
  }
  return Math.max(0, totalMin / 60);
}

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ── XLSX Sheet Builders ───────────────────────────────────────────────────────

function getHours(e) {
  return parseFloat(e.hours_worked) || calcHours(e);
}

function groupBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

function codeCounts(entries) {
  const reg = entries.filter((e) => e.code === 'REG').length;
  const wfh = entries.filter((e) => e.code === 'WFH').length;
  const pto = entries.filter((e) => e.code === 'PTO').length;
  const sick = entries.filter((e) => e.code === 'SICK').length;
  const other = entries.filter((e) => ['SICK_PART', 'APPT', 'EARLY'].includes(e.code)).length;
  const daysWorked = entries.filter((e) => !['PTO', 'SICK'].includes(e.code)).length;
  const totalHours = entries.reduce((s, e) => s + getHours(e), 0);
  return { totalHours, daysWorked, reg, wfh, pto, sick, other };
}

function r2(n) { return Math.round(n * 100) / 100; }

function sortedEmployeeGroups(byEmployee, getEmployeeName) {
  return Object.entries(byEmployee).sort((a, b) =>
    getEmployeeName(a[0]).localeCompare(getEmployeeName(b[0]))
  );
}

// Sheet 1: Weekly Detail
function buildWeeklyDetailSheet(entries, getEmployeeName) {
  const headers = ['Employee', 'Date', 'Day', 'Location', 'Code', 'Start', 'Lunch Out', 'Lunch In', 'End', 'Break (min)', 'Hours Worked', 'Notes'];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Sort by employee name then date
  const sorted = [...entries].sort((a, b) => {
    const nameA = getEmployeeName(a.employee_user_id);
    const nameB = getEmployeeName(b.employee_user_id);
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return a.work_date.localeCompare(b.work_date);
  });
  const rows = sorted.map((e) => {
    const d = new Date(e.work_date + 'T00:00:00');
    const hours = getHours(e);
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
      r2(hours),
      e.notes || '',
    ];
  });
  return [headers, ...rows];
}

// Sheet 2: Weekly Summary (per employee + totals row)
function buildWeeklySummarySheet(entries, getEmployeeName) {
  const headers = ['Employee', 'Total Hours', 'Days Worked', 'REG Days', 'WFH Days', 'PTO Days', 'Sick Days', 'Partial/Appt/Early', 'Avg Hours/Day'];
  const byEmployee = groupBy(entries, (e) => e.employee_user_id);
  const rows = [];
  let grandHours = 0, grandDays = 0, grandReg = 0, grandWfh = 0, grandPto = 0, grandSick = 0, grandOther = 0;

  for (const [id, empEntries] of sortedEmployeeGroups(byEmployee, getEmployeeName)) {
    const c = codeCounts(empEntries);
    const avg = c.daysWorked > 0 ? c.totalHours / c.daysWorked : 0;
    rows.push([getEmployeeName(id), r2(c.totalHours), c.daysWorked, c.reg, c.wfh, c.pto, c.sick, c.other, r2(avg)]);
    grandHours += c.totalHours; grandDays += c.daysWorked; grandReg += c.reg;
    grandWfh += c.wfh; grandPto += c.pto; grandSick += c.sick; grandOther += c.other;
  }
  const grandAvg = grandDays > 0 ? grandHours / grandDays : 0;
  rows.push(['TOTAL', r2(grandHours), grandDays, grandReg, grandWfh, grandPto, grandSick, grandOther, r2(grandAvg)]);

  return [headers, ...rows];
}

// Sheet 3: Monthly Summary (cumulative hours per employee per month)
function buildMonthlySummarySheet(ytdEntries, getEmployeeName, year) {
  const headers = ['Employee', ...MONTH_NAMES_SHORT.map((m) => `${m} Hours`), 'YTD Total', ...MONTH_NAMES_SHORT.map((m) => `${m} PTO`), 'YTD PTO', ...MONTH_NAMES_SHORT.map((m) => `${m} Sick`), 'YTD Sick'];
  const byEmployee = groupBy(ytdEntries, (e) => e.employee_user_id);
  const rows = [];

  for (const [id, empEntries] of sortedEmployeeGroups(byEmployee, getEmployeeName)) {
    const monthlyHours = new Array(12).fill(0);
    const monthlyPto = new Array(12).fill(0);
    const monthlySick = new Array(12).fill(0);

    for (const e of empEntries) {
      const month = parseInt(e.work_date.substring(5, 7), 10) - 1;
      monthlyHours[month] += getHours(e);
      if (e.code === 'PTO') monthlyPto[month]++;
      if (e.code === 'SICK') monthlySick[month]++;
    }

    const ytdHours = monthlyHours.reduce((a, b) => a + b, 0);
    const ytdPto = monthlyPto.reduce((a, b) => a + b, 0);
    const ytdSick = monthlySick.reduce((a, b) => a + b, 0);

    rows.push([
      getEmployeeName(id),
      ...monthlyHours.map(r2),
      r2(ytdHours),
      ...monthlyPto,
      ytdPto,
      ...monthlySick,
      ytdSick,
    ]);
  }

  return [headers, ...rows];
}

// Sheet 4: YTD Summary (per employee + totals row)
function buildYTDSheet(ytdEntries, getEmployeeName, year) {
  const headers = ['Employee', 'Year', 'Total Hours', 'Days Worked', 'REG Days', 'WFH Days', 'PTO Days Used', 'Sick Days Used', 'Partial/Appt/Early', 'Avg Hours/Week', 'Weeks Entered'];
  const byEmployee = groupBy(ytdEntries, (e) => e.employee_user_id);
  const rows = [];
  let grandHours = 0, grandDays = 0, grandReg = 0, grandWfh = 0, grandPto = 0, grandSick = 0, grandOther = 0, grandWeeks = 0;

  for (const [id, empEntries] of sortedEmployeeGroups(byEmployee, getEmployeeName)) {
    const c = codeCounts(empEntries);
    const weeksSet = new Set(empEntries.map((e) => e.week_start));
    const weeksEntered = weeksSet.size;
    const avgPerWeek = weeksEntered > 0 ? c.totalHours / weeksEntered : 0;
    rows.push([getEmployeeName(id), year, r2(c.totalHours), c.daysWorked, c.reg, c.wfh, c.pto, c.sick, c.other, r2(avgPerWeek), weeksEntered]);
    grandHours += c.totalHours; grandDays += c.daysWorked; grandReg += c.reg;
    grandWfh += c.wfh; grandPto += c.pto; grandSick += c.sick; grandOther += c.other; grandWeeks = Math.max(grandWeeks, weeksEntered);
  }
  const grandAvgWk = grandWeeks > 0 ? grandHours / grandWeeks : 0;
  rows.push(['TOTAL', year, r2(grandHours), grandDays, grandReg, grandWfh, grandPto, grandSick, grandOther, r2(grandAvgWk), grandWeeks]);

  return [headers, ...rows];
}

// Sheet 5: Attendance Flags — highlights substandard patterns
function buildAttendanceFlagsSheet(ytdEntries, getEmployeeName, year) {
  const headers = ['Employee', 'Flag', 'Severity', 'Detail'];
  const byEmployee = groupBy(ytdEntries, (e) => e.employee_user_id);
  const rows = [];

  for (const [id, empEntries] of sortedEmployeeGroups(byEmployee, getEmployeeName)) {
    const name = getEmployeeName(id);
    const c = codeCounts(empEntries);
    const weeksSet = new Set(empEntries.map((e) => e.week_start));
    const weeksEntered = weeksSet.size;
    const avgPerWeek = weeksEntered > 0 ? c.totalHours / weeksEntered : 0;
    const totalDays = empEntries.length;

    // Flag 1: Low weekly average hours (< 35h/week)
    if (weeksEntered >= 2 && avgPerWeek < 35) {
      rows.push([name, 'Low Avg Hours/Week', 'WARNING', `${r2(avgPerWeek)}h avg over ${weeksEntered} weeks (expected ~40h)`]);
    }

    // Flag 2: Excessive PTO (> 15 days YTD)
    if (c.pto > 15) {
      rows.push([name, 'High PTO Usage', 'INFO', `${c.pto} PTO days used YTD`]);
    }

    // Flag 3: Excessive sick days (> 10 days YTD)
    if (c.sick > 10) {
      rows.push([name, 'High Sick Usage', 'WARNING', `${c.sick} sick days used YTD`]);
    }

    // Flag 4: Frequent partial/early/appt (> 10 occurrences YTD)
    if (c.other > 10) {
      rows.push([name, 'Frequent Partial/Early/Appt', 'INFO', `${c.other} occurrences YTD`]);
    }

    // Flag 5: Sick + partial sick combined > 12
    const sickPartial = empEntries.filter((e) => e.code === 'SICK' || e.code === 'SICK_PART').length;
    if (sickPartial > 12) {
      rows.push([name, 'High Combined Sick Usage', 'WARNING', `${sickPartial} sick + partial sick days YTD`]);
    }

    // Flag 6: Missing weeks — compare to expected weeks so far this year
    const yearStart = new Date(`${year}-01-01T00:00:00`);
    const now = new Date();
    const endDate = now.getFullYear() === year ? now : new Date(`${year}-12-31T00:00:00`);
    const expectedWeeks = Math.floor((endDate - yearStart) / (7 * 24 * 60 * 60 * 1000));
    const missingWeeks = expectedWeeks - weeksEntered;
    if (expectedWeeks > 4 && missingWeeks > 4) {
      rows.push([name, 'Missing Time Entries', 'WARNING', `${missingWeeks} weeks missing out of ~${expectedWeeks} expected`]);
    }

    // Flag 7: Low attendance rate (days worked / total days entered < 80%)
    if (totalDays >= 20) {
      const attendanceRate = c.daysWorked / totalDays;
      if (attendanceRate < 0.8) {
        rows.push([name, 'Low Attendance Rate', 'CRITICAL', `${Math.round(attendanceRate * 100)}% attendance (${c.daysWorked}/${totalDays} days worked)`]);
      }
    }

    // Flag 8: Short days pattern — check for weeks with consistently < 7h/day
    const byWeek = groupBy(empEntries, (e) => e.week_start);
    let shortWeeks = 0;
    for (const [, weekEntries] of Object.entries(byWeek)) {
      const workDays = weekEntries.filter((e) => !['PTO', 'SICK'].includes(e.code));
      if (workDays.length >= 3) {
        const avgDayHours = workDays.reduce((s, e) => s + getHours(e), 0) / workDays.length;
        if (avgDayHours < 7) shortWeeks++;
      }
    }
    if (shortWeeks >= 3) {
      rows.push([name, 'Frequent Short Days', 'WARNING', `${shortWeeks} weeks with avg < 7h/day`]);
    }
  }

  // Sort by severity: CRITICAL > WARNING > INFO
  const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
  rows.sort((a, b) => (severityOrder[a[2]] ?? 3) - (severityOrder[b[2]] ?? 3));

  if (rows.length === 0) {
    rows.push(['—', 'No flags detected', '—', 'All employees within normal attendance parameters']);
  }

  return [headers, ...rows];
}

// ── Build & Download XLSX ─────────────────────────────────────────────────────

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

  if (ytdEntries && ytdEntries.length > 0) {
    // Sheet 3: Monthly Summary (cumulative hours by month)
    const monthlyData = buildMonthlySummarySheet(ytdEntries, getEmployeeName, year);
    const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData);
    const monthlyCols = [{ wch: 20 }];
    for (let i = 0; i < 12; i++) monthlyCols.push({ wch: 10 }); // hours
    monthlyCols.push({ wch: 12 }); // YTD total
    for (let i = 0; i < 12; i++) monthlyCols.push({ wch: 8 }); // PTO
    monthlyCols.push({ wch: 10 }); // YTD PTO
    for (let i = 0; i < 12; i++) monthlyCols.push({ wch: 8 }); // sick
    monthlyCols.push({ wch: 10 }); // YTD sick
    wsMonthly['!cols'] = monthlyCols;
    XLSX.utils.book_append_sheet(wb, wsMonthly, 'Monthly Summary');

    // Sheet 4: YTD Summary
    const ytdData = buildYTDSheet(ytdEntries, getEmployeeName, year);
    const wsYTD = XLSX.utils.aoa_to_sheet(ytdData);
    wsYTD['!cols'] = [
      { wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsYTD, `YTD ${year}`);

    // Sheet 5: Attendance Flags
    const flagsData = buildAttendanceFlagsSheet(ytdEntries, getEmployeeName, year);
    const wsFlags = XLSX.utils.aoa_to_sheet(flagsData);
    wsFlags['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 10 }, { wch: 55 }];
    XLSX.utils.book_append_sheet(wb, wsFlags, 'Attendance Flags');
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
                  title="Export XLSX with Weekly Detail, Summary, Monthly, YTD, and Attendance Flags"
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
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap overflow-x-auto pb-2">
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
