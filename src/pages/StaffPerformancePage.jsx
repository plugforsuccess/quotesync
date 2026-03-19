// src/pages/StaffPerformancePage.jsx
// Performance Dashboard — Individual scorecard, Team comparison, Trends,
// Daily breakdown, Outbound breakdown, PDF export, per-employee goals.
// Supports role-aware views: service reps (full scorecard) and producers (outbound effort).
// v3: Call log as primary data source with summary report as optional supplement.
// Route: /admin/staff-performance
// Access: platform_master_admin, platform_admin only

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3, Users, RefreshCw, ShieldOff, AlertCircle, ChevronLeft, ChevronRight,
  Filter, Target, Download, ArrowLeft, Shield, DollarSign,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTimeEntries, useRCData, useProactivityData, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useRCEmployeeMap, useActiveEmployees, normalizeAliasKey } from '../hooks/useEmployees';
import {
  useEmployeeTargets, useSaveTargets,
  useSaveProactivity,
  useOutboundBreakdown, useSaveOutboundBreakdown,
  useTrendData, useTeamData,
  useCallLogData, useInvalidateCallLog,
  useQueueData, useInvalidateQueueData,
} from '../hooks/useStaffPerformance';
import { computeCallLogMetrics, RETENTION_BONUS_THRESHOLD, RETENTION_BONUS_PER_SAVE } from '../config/staffPerformanceDefaults';
import CallLogUploadForm from './components/time-attendance/CallLogUploadForm';
import QueueUploadForm from './components/time-attendance/QueueUploadForm';
import RCUploadForm from './components/time-attendance/RCUploadForm';
import StaffScorecard from './components/time-attendance/StaffScorecard';
import DiscrepancyAlerts, { BonusVerificationAlert } from './components/time-attendance/DiscrepancyAlerts';
import CoverageAlerts from './components/time-attendance/CoverageAlerts';
import QueueSummaryCard from './components/time-attendance/QueueSummaryCard';
import TargetsModal from './components/time-attendance/TargetsModal';
import TeamComparisonView from './components/time-attendance/TeamComparisonView';
import TrendsView from './components/time-attendance/TrendsView';
import DailyBreakdown from './components/time-attendance/DailyBreakdown';
import OutboundBreakdownForm from './components/time-attendance/OutboundBreakdownForm';
import ProducerDetailView from './components/time-attendance/ProducerDetailView';
import CallLogTable from './components/time-attendance/CallLogTable';
import AgentAliasManager from './components/time-attendance/AgentAliasManager';
import { useRetentionMetrics } from '../hooks/useRetentionMetrics';
import { useRetentionCallVerification } from '../hooks/useRetentionCallVerification';
import RetentionScorecard from './components/time-attendance/RetentionScorecard';
import PageSpinner from '../components/PageSpinner';
// ScorecardPDF + @react-pdf/renderer loaded on-demand to avoid bloating the main bundle

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

// ── Role filter options ──────────────────────────────────────────────────────

const ROLE_FILTER_OPTIONS = [
  { key: 'service_inbound',  label: 'Service (Inbound)'  },
  { key: 'service_outbound', label: 'Service (Outbound)' },
  { key: 'sales',            label: 'Sales'              },
  { key: 'all',              label: 'All'                },
];

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'individual', label: 'Individual', icon: BarChart3 },
  { key: 'team', label: 'Team', icon: Users },
];

// ── Page Component ─────────────────────────────────────────────────────────────

const StaffPerformancePage = () => {
  const { user, currentAgencyId } = useAuth();
  const { platform, agency } = usePermissions();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(
    () => searchParams.get('tab') || 'individual'
  );
  const [targetsModalOpen, setTargetsModalOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [roleFilter, setRoleFilter] = useState('service_inbound');
  // Track whether the individual view was entered from the team view for a specific role
  const [selectedEmployeeRole, setSelectedEmployeeRole] = useState(null);

  // ── React Query hooks ─────────────────────────────────────────────────────

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

  // Shared proactivity query — fetches all employees for the week
  const {
    data: proactivityList = [],
    refetch: refetchProactivity,
  } = useProactivityData(weekStart, selectedEmployee);

  // Active employees from employees table for dropdown + RC matching
  const { data: rosterEmployees = [] } = useActiveEmployees(currentAgencyId);
  const { invalidateRCData, invalidateProactivity } = useInvalidateTimeData();

  // v2 hooks — per-employee targets, outbound breakdown, trends, team
  const singleEmployee = selectedEmployee !== 'all' ? selectedEmployee : (rcData.length === 1 ? rcData[0]?.employee_user_id : null);

  const { data: employeeTargets } = useEmployeeTargets(singleEmployee, weekStart);
  const { mutate: saveTargets, isPending: savingTargets } = useSaveTargets();
  const { mutate: saveProactivity, isPending: savingProactivity } = useSaveProactivity();
  const { data: outboundBreakdownData } = useOutboundBreakdown(singleEmployee, weekStart);
  const { mutate: saveOutboundBreakdown, isPending: savingOutboundBreakdown } = useSaveOutboundBreakdown();
  const { data: trendData } = useTrendData(singleEmployee, weekStart);
  const { data: teamData, isLoading: teamLoading } = useTeamData(weekStart);

  // v3: Call log data
  const { data: callLogData = [], refetch: refetchCallLog } = useCallLogData(singleEmployee, weekStart);
  const { invalidateCallLog, invalidateAllCallLogs } = useInvalidateCallLog();

  // v3: Queue data (org-wide, not per-employee)
  const { data: queueData = [], refetch: refetchQueueData } = useQueueData(currentAgencyId, weekStart);
  const { invalidateQueueData } = useInvalidateQueueData();

  // Compute call log metrics from raw call data
  const callLogMetrics = useMemo(() => {
    if (!callLogData || callLogData.length === 0) return null;
    return computeCallLogMetrics(callLogData, weekStart);
  }, [callLogData, weekStart]);

  const entries = timeData?.entries || [];
  const employees = timeData?.employees || [];
  const isLoading = entriesLoading || rcLoading;
  const error = entriesError;

  // Resolve the role of the currently selected employee
  const resolvedEmployeeRole = useMemo(() => {
    if (selectedEmployeeRole) return selectedEmployeeRole;
    if (!singleEmployee || !rosterEmployees.length) return 'service_inbound';
    const emp = rosterEmployees.find(
      (e) => (e.auth_user_id || e.id) === singleEmployee
    );
    return emp?.roles?.[0] || 'service_inbound';
  }, [selectedEmployeeRole, singleEmployee, rosterEmployees]);

  // Is this employee a producer?
  const isProducerView = resolvedEmployeeRole === 'sales';

  // Map selected employee to employees.id for retention metrics
  const selectedEmployeeRecord = useMemo(() => {
    if (!singleEmployee || !rosterEmployees?.length) return null;
    return rosterEmployees.find(e =>
      e.auth_user_id === singleEmployee || e.id === singleEmployee
    ) || null;
  }, [singleEmployee, rosterEmployees]);

  const selectedEmployeeRoles = selectedEmployeeRecord?.roles || [];
  const scoreType = selectedEmployeeRoles.includes('service_outbound') && selectedEmployeeRoles.includes('service_inbound')
    ? 'both'
    : selectedEmployeeRoles.includes('service_outbound')
    ? 'outbound'
    : 'inbound';

  const { data: retentionMetrics, isLoading: retentionLoading } = useRetentionMetrics(
    selectedEmployeeRecord?.id,
    scoreType,
  );

  // ── Monthly bonus verification (service_outbound) ───────────────────────────
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const { data: verificationData } = useRetentionCallVerification({
    employeeId: selectedEmployeeRecord?.id,
    agencyId: currentAgencyId,
    month: selectedMonth,
  });

  const bonusSaves  = verificationData?.verified ?? 0;
  const bonusAmount = Math.max(0, bonusSaves - RETENTION_BONUS_THRESHOLD) * RETENTION_BONUS_PER_SAVE;

  function refetchAll() {
    refetchEntries();
    refetchRC();
    refetchProactivity();
    refetchCallLog();
    refetchQueueData();
  }

  // ── Employee name resolver ───────────────────────────────────────────────

  function getEmployeeName(userId) {
    // Try roster employees first (has first/last name)
    const roster = rosterEmployees.find((e) => (e.auth_user_id || e.id) === userId);
    if (roster) {
      return `${roster.preferred_name || roster.first_name} ${roster.last_name || ''}`.trim();
    }
    // Fallback to team data employees map
    const teamEmp = teamData?.employees?.[userId];
    if (teamEmp) {
      return `${teamEmp.preferred_name || teamEmp.first_name} ${teamEmp.last_name || ''}`.trim();
    }
    const profile = employees.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || userId?.substring(0, 8) || 'Unknown';
  }

  // ── Employee map for RC upload ─────────────────────────────────────────
  // useRCEmployeeMap now handles all matching layers:
  // 1) alias table (highest priority — admin decisions)
  // 2) rc_display_name
  // 3) preferred_name + last_name
  // 4) first_name + last_name (lowest priority)

  const { data: rcEmployeeMap } = useRCEmployeeMap(currentAgencyId);

  // Fallback to roster-based map if rcEmployeeMap hasn't loaded yet
  const employeeMap = useMemo(() => {
    if (rcEmployeeMap && Object.keys(rcEmployeeMap).length > 0) return rcEmployeeMap;
    const map = {};
    rosterEmployees.forEach((emp) => {
      const value = emp.auth_user_id || emp.id;
      if (emp.rc_display_name) {
        map[normalizeAliasKey(emp.rc_display_name)] = value;
      }
      const fullName = normalizeAliasKey(`${emp.first_name} ${emp.last_name}`);
      if (fullName && !map[fullName]) {
        map[fullName] = value;
      }
      if (emp.preferred_name) {
        const prefName = normalizeAliasKey(`${emp.preferred_name} ${emp.last_name}`);
        if (prefName && !map[prefName]) {
          map[prefName] = value;
        }
      }
    });
    return map;
  }, [rcEmployeeMap, rosterEmployees]);

  // Use roster employees (employees table) for dropdown
  const employeeOptions = rosterEmployees.length > 0 ? rosterEmployees : employees;

  function handleRCUploaded() {
    invalidateRCData(weekStart, selectedEmployee);
  }

  function handleCallLogUploaded() {
    if (singleEmployee) {
      invalidateCallLog(singleEmployee, weekStart);
    } else {
      invalidateAllCallLogs();
    }
  }

  function handleQueueDataUploaded() {
    invalidateQueueData(currentAgencyId, weekStart);
  }

  // ── Proactivity save handler (uses React Query mutation + cache invalidation)

  const handleProactivityChange = useCallback((field, value) => {
    if (!singleEmployee) return;
    const current = proactivityList.find((p) => p.employee_user_id === singleEmployee);
    saveProactivity({
      org_id: currentAgencyId,
      employee_user_id: singleEmployee,
      week_start: weekStart,
      follow_up_notes_logged: field === 'follow_up_notes_logged' ? value : (current?.follow_up_notes_logged || false),
      queue_participation: field === 'queue_participation' ? value : (current?.queue_participation || false),
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }, {
      onSuccess: () => invalidateProactivity(weekStart, selectedEmployee),
    });
  }, [singleEmployee, weekStart, user, proactivityList, saveProactivity, invalidateProactivity, selectedEmployee]);

  // ── PDF export handler ───────────────────────────────────────────────────

  async function handleDownloadPDF(rc) {
    setPdfGenerating(true);
    try {
      const [{ pdf }, { default: ScorecardPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./components/time-attendance/ScorecardPDF'),
      ]);

      const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
      const daysWorked = empEntries.filter((e) => ['REG', 'WFH'].includes(e.code)).length || 5;
      const empProactivity = proactivityList.find((p) => p.employee_user_id === rc.employee_user_id);

      const blob = await pdf(
        <ScorecardPDF
          rcData={rc}
          daysWorked={daysWorked}
          targets={employeeTargets}
          proactivity={empProactivity}
          alerts={[]}
          weekStart={weekStart}
          retentionMetrics={retentionMetrics}
        />
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scorecard-${(rc.employee_name || 'employee').replace(/\s+/g, '-').toLowerCase()}-${weekStart}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfGenerating(false);
    }
  }

  // ── Team view employee navigation ────────────────────────────────────────

  function handleSelectEmployeeFromTeam(employeeId, employeeRoleType) {
    setSelectedEmployee(employeeId);
    setSelectedEmployeeRole(employeeRoleType || null);
    setActiveTab('individual');
  }

  // ── Back to team view ──────────────────────────────────────────────────

  function handleBackToTeam() {
    setSelectedEmployee('all');
    setSelectedEmployeeRole(null);
    setActiveTab('team');
  }

  // ── Permission Check ─────────────────────────────────────────────────────

  if (!platform.isAdmin && !agency.isPrincipal) {
    return (
      <div className="dark-page flex items-center justify-center">
        <div className="text-center">
          <ShieldOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-qs-bright mb-2">Access Denied</h2>
          <p className="text-qs-dim">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // ── Loading / Error States ───────────────────────────────────────────────

  if (isLoading && entries.length === 0 && rcData.length === 0) {
    return <PageSpinner label="Loading performance data..." />;
  }

  if (error) {
    return (
      <div className="dark-page flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-qs-card rounded-lg p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-qs-bright mb-4">Failed to Load</h2>
          <p className="text-qs-dim mb-6">{error.message}</p>
          <button
            onClick={refetchAll}
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
              <BarChart3 className="w-8 h-8 text-primary-400" />
              <div>
                <h1 className="dark-heading">Performance Dashboard</h1>
                <p className="dark-subheading">RingCentral metrics, scorecards, trends, and team comparison</p>
              </div>
            </div>
            <button
              onClick={refetchAll}
              disabled={isLoading}
              className="p-2 text-qs-dim hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50 min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
              title="Refresh"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-qs-card border-b border-qs-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    active
                      ? 'border-primary-400 text-primary-400'
                      : 'border-transparent text-qs-subtle hover:text-qs-text hover:border-qs-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-qs-card border-b border-qs-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap overflow-x-auto pb-2">
          {/* Role filter — only in team view */}
          {activeTab === 'team' && (
            <div className="inline-flex rounded-lg border border-qs-border overflow-hidden">
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRoleFilter(opt.key)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    roleFilter === opt.key
                      ? 'bg-primary-600 text-white'
                      : 'bg-qs-elevated text-qs-text hover:bg-qs-card'
                  } ${opt.key !== 'service_inbound' ? 'border-l border-qs-border' : ''}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Back to team button — when viewing individual from team drill-down */}
          {activeTab === 'individual' && selectedEmployeeRole && (
            <button
              onClick={handleBackToTeam}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-qs-text hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Team
            </button>
          )}

          {/* Week selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, -1))}
              className="p-2 text-qs-dim hover:text-primary-400 hover:bg-primary-900/20 rounded transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-qs-bright min-w-[200px] text-center">
              {formatWeekLabel(weekStart)}
            </span>
            <button
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              className="p-2 text-qs-dim hover:text-primary-400 hover:bg-primary-900/20 rounded transition-colors min-w-[44px] min-h-[44px] inline-flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Employee filter (only in individual view, not when viewing from team drill-down) */}
          {activeTab === 'individual' && !selectedEmployeeRole && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-qs-subtle" />
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-qs-elevated text-qs-text border-0 focus:ring-2 focus:ring-primary-500"
              >
                <option value="all">All Employees</option>
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.auth_user_id || emp.id}>
                    {emp.preferred_name || emp.first_name
                      ? `${emp.preferred_name || emp.first_name} ${emp.last_name || ''}`
                      : emp.full_name || emp.email || emp.id.substring(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Goals button — only for single employee */}
          {activeTab === 'individual' && singleEmployee && (
            <button
              onClick={() => setTargetsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-qs-text hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors"
              title="Edit performance goals"
            >
              <Target className="w-4 h-4" />
              Goals
            </button>
          )}

          {/* Quick jump to current week */}
          <button
            onClick={() => setWeekStart(toMonday(new Date()))}
            className="text-sm text-primary-400 hover:text-primary-300 font-medium ml-auto"
          >
            This Week
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'team' ? (
          /* ── Team Comparison View ───────────────────────────────────────── */
          <div className="space-y-6">
            {teamLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-4" />
                <p className="text-qs-dim">Loading team data...</p>
              </div>
            ) : (
              <TeamComparisonView
                teamData={teamData}
                roleFilter={roleFilter}
                onSelectEmployee={handleSelectEmployeeFromTeam}
              />
            )}
          </div>
        ) : isProducerView ? (
          /* ── Producer Individual View ─────────────────────────────────── */
          <div className="space-y-6">
            {rcData.length === 0 ? (
              <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
                <BarChart3 className="w-16 h-16 text-qs-muted mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-qs-bright mb-2">No performance data</h2>
                <p className="text-qs-dim">Upload RingCentral data for this week to see producer metrics.</p>
              </div>
            ) : (
              rcData.map((rc) => {
                const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
                const isSelectedEmployee = singleEmployee === rc.employee_user_id;
                // Resolve roster employee ID for comp model link
                const rosterEmp = rosterEmployees.find((e) => (e.auth_user_id || e.id) === rc.employee_user_id);

                return (
                  <div key={rc.id} className="space-y-4">
                    {/* Cross-check alerts (producer-scoped) */}
                    <DiscrepancyAlerts
                      timeEntries={empEntries}
                      rcData={rc}
                      weekStart={weekStart}
                      roleType="sales"
                    />

                    {/* Producer detail view */}
                    <ProducerDetailView
                      rcData={rc}
                      employeeName={rc.employee_name || getEmployeeName(rc.employee_user_id)}
                      weekStart={weekStart}
                      trendData={isSelectedEmployee ? trendData : null}
                      targets={isSelectedEmployee ? employeeTargets : null}
                      producerId={rosterEmp?.id}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ── Service Rep Individual View ──────────────────────────────────── */
          <div className="space-y-6">
            {/* 1. Daily Call Log Upload (primary) */}
            <CallLogUploadForm
              orgId={currentAgencyId}
              weekStart={weekStart}
              employeeMap={employeeMap}
              onUploaded={handleCallLogUploaded}
            />

            {/* 2. Daily Queue Report Upload */}
            <QueueUploadForm
              orgId={currentAgencyId}
              onUploaded={handleQueueDataUploaded}
            />

            {/* 3. Weekly Summary Upload (optional supplement) */}
            <RCUploadForm
              orgId={currentAgencyId}
              weekStart={weekStart}
              employeeMap={employeeMap}
              onUploaded={handleRCUploaded}
            />

            {/* 4. Agent Alias Manager — resolve unmatched names */}
            <AgentAliasManager
              orgId={currentAgencyId}
              employees={rosterEmployees}
            />

            {/* Scorecards */}
            {rcData.length === 0 && !callLogMetrics ? (
              <div className="bg-qs-card rounded-lg border border-qs-border p-12 text-center">
                <BarChart3 className="w-16 h-16 text-qs-muted mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-qs-bright mb-2">No performance data</h2>
                <p className="text-qs-dim">Upload a call log or RingCentral XLSX to see the scorecard.</p>
              </div>
            ) : callLogMetrics && singleEmployee ? (
              /* Call log available for single employee — show unified scorecard */
              <div className="space-y-4">
                {/* Employee header with PDF download */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-qs-bright flex items-center gap-2">
                    <Users className="w-5 h-5 text-qs-muted" />
                    {getEmployeeName(singleEmployee)}
                  </h3>
                  {rcData.length > 0 && (
                    <button
                      onClick={() => handleDownloadPDF(rcData.find((r) => r.employee_user_id === singleEmployee) || rcData[0])}
                      disabled={pdfGenerating}
                      className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-qs-text hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50"
                      title="Download PDF scorecard"
                    >
                      <Download className="w-4 h-4" />
                      {pdfGenerating ? 'Generating...' : 'Download PDF'}
                    </button>
                  )}
                </div>

                {/* Coverage Alerts (queue + call log comparison) */}
                <CoverageAlerts
                  queueData={queueData}
                  callLogData={callLogData}
                  weekStart={weekStart}
                  employeeId={singleEmployee}
                />

                {/* Cross-check alerts (time entries vs RC) */}
                {rcData.length > 0 && (() => {
                  const rc = rcData.find((r) => r.employee_user_id === singleEmployee) || rcData[0];
                  const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
                  return (
                    <DiscrepancyAlerts
                      timeEntries={empEntries}
                      rcData={rc}
                      weekStart={weekStart}
                      roleType={resolvedEmployeeRole}
                    />
                  );
                })()}

                {/* Scorecard with call log metrics as primary */}
                <StaffScorecard
                  rcData={rcData.find((r) => r.employee_user_id === singleEmployee) || null}
                  callLogMetrics={callLogMetrics}
                  daysWorked={(() => {
                    const empEntries = entries.filter((e) => e.employee_user_id === singleEmployee);
                    return empEntries.filter((e) => ['REG', 'WFH'].includes(e.code)).length || 5;
                  })()}
                  targets={employeeTargets}
                  proactivity={proactivityList.find((p) => p.employee_user_id === singleEmployee)}
                  onProactivityChange={handleProactivityChange}
                  savingProactivity={savingProactivity}
                />

                {/* Queue Coverage summary (when queue data exists) */}
                <QueueSummaryCard
                  queueData={queueData}
                  weekStart={weekStart}
                />

                {/* Daily Breakdown (from call log) */}
                <DailyBreakdown
                  rcData={rcData.find((r) => r.employee_user_id === singleEmployee)}
                  callLogDaily={callLogMetrics.daily}
                />

                {/* Call Log Detail Table */}
                <CallLogTable calls={callLogData} />

                {/* Outbound Call Breakdown */}
                <OutboundBreakdownForm
                  breakdownData={outboundBreakdownData}
                  totalOutbound={callLogMetrics.outboundAttempts}
                  onSave={saveOutboundBreakdown}
                  saving={savingOutboundBreakdown}
                  orgId={currentAgencyId}
                  employeeId={singleEmployee}
                  weekStart={weekStart}
                />

                {/* Trends (8-week) */}
                <TrendsView
                  trendData={trendData}
                  targets={employeeTargets}
                />
              </div>
            ) : (
              /* Fall back to legacy per-rcData display */
              rcData.map((rc) => {
                const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
                const daysWorked = empEntries.filter((e) => ['REG', 'WFH'].includes(e.code)).length;
                const isSelectedEmployee = singleEmployee === rc.employee_user_id;
                const empProactivity = proactivityList.find(
                  (p) => p.employee_user_id === rc.employee_user_id
                );

                return (
                  <div key={rc.id} className="space-y-4">
                    {/* Employee header with PDF download */}
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-qs-bright flex items-center gap-2">
                        <Users className="w-5 h-5 text-qs-muted" />
                        {rc.employee_name || getEmployeeName(rc.employee_user_id)}
                      </h3>
                      <button
                        onClick={() => handleDownloadPDF(rc)}
                        disabled={pdfGenerating}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-qs-text hover:text-primary-400 hover:bg-primary-900/20 rounded-lg transition-colors disabled:opacity-50"
                        title="Download PDF scorecard"
                      >
                        <Download className="w-4 h-4" />
                        {pdfGenerating ? 'Generating...' : 'Download PDF'}
                      </button>
                    </div>

                    {/* Cross-check alerts */}
                    <DiscrepancyAlerts
                      timeEntries={empEntries}
                      rcData={rc}
                      weekStart={weekStart}
                      roleType={resolvedEmployeeRole}
                    />

                    {/* Scorecard with per-employee targets and manual proactivity */}
                    <StaffScorecard
                      rcData={rc}
                      daysWorked={daysWorked || 5}
                      targets={isSelectedEmployee ? employeeTargets : null}
                      proactivity={empProactivity}
                      onProactivityChange={isSelectedEmployee ? handleProactivityChange : null}
                      savingProactivity={savingProactivity}
                    />

                    {/* Daily Breakdown */}
                    <DailyBreakdown rcData={rc} />

                    {/* Outbound Call Breakdown */}
                    {isSelectedEmployee && (
                      <OutboundBreakdownForm
                        breakdownData={outboundBreakdownData}
                        totalOutbound={rc.outbound_calls}
                        onSave={saveOutboundBreakdown}
                        saving={savingOutboundBreakdown}
                        orgId={currentAgencyId}
                        employeeId={rc.employee_user_id}
                        weekStart={weekStart}
                      />
                    )}

                    {/* Trends (8-week) */}
                    {isSelectedEmployee && (
                      <TrendsView
                        trendData={trendData}
                        targets={employeeTargets}
                      />
                    )}
                  </div>
                );
              })
            )}

            {/* Retention Performance — only for service employees */}
            {(selectedEmployeeRoles.includes('service_inbound') ||
              selectedEmployeeRoles.includes('service_outbound') ||
              selectedEmployeeRoles.includes('service')) && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-qs-subtle uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Retention Performance
                </h3>
                <RetentionScorecard
                  metrics={retentionMetrics}
                  isLoading={retentionLoading}
                />
              </div>
            )}

            {/* Monthly Bonus Verification — service_outbound only */}
            {selectedEmployeeRoles.includes('service_outbound') && selectedMonth && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-qs-subtle uppercase tracking-wider mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Monthly Bonus Verification — {selectedMonth}
                </h3>

                <div className="mb-3">
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="text-sm border border-qs-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-qs-elevated text-qs-text"
                  />
                </div>

                <div className="bg-qs-card rounded-lg border border-qs-border p-5 mb-3">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-qs-bright">
                        {bonusSaves}
                      </div>
                      <div className="text-xs text-qs-subtle mt-1">Verified saves</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-400">
                        {Math.max(0, bonusSaves - RETENTION_BONUS_THRESHOLD)} &times; $25
                      </div>
                      <div className="text-xs text-qs-subtle mt-1">
                        saves above {RETENTION_BONUS_THRESHOLD} threshold
                      </div>
                    </div>
                    <div className="text-center">
                      <div className={`text-2xl font-bold ${bonusAmount > 0 ? 'text-emerald-400' : 'text-qs-muted'}`}>
                        ${bonusAmount.toLocaleString()}
                      </div>
                      <div className="text-xs text-qs-subtle mt-1">bonus earned</div>
                    </div>
                  </div>

                  <BonusVerificationAlert
                    verificationData={verificationData}
                    month={selectedMonth}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Targets Modal */}
      {singleEmployee && (
        <TargetsModal
          open={targetsModalOpen}
          onClose={() => setTargetsModalOpen(false)}
          employeeName={getEmployeeName(singleEmployee)}
          employeeId={singleEmployee}
          orgId={currentAgencyId}
          currentTargets={employeeTargets}
          roleType={resolvedEmployeeRole}
          onSave={(targets) => {
            saveTargets(targets, {
              onSuccess: () => setTargetsModalOpen(false),
            });
          }}
          saving={savingTargets}
        />
      )}
    </div>
  );
};

export default StaffPerformancePage;
