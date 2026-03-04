// src/pages/CSPerformancePage.jsx
// Performance Dashboard — Individual scorecard, Team comparison, Trends,
// Daily breakdown, Outbound breakdown, PDF export, per-employee goals.
// Supports role-aware views: service reps (full scorecard) and producers (outbound effort).
// Route: /admin/cs-performance
// Access: platform_master_admin, platform_admin only

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart3, Users, RefreshCw, AlertCircle, ChevronLeft, ChevronRight,
  Filter, Target, Download, ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTimeEntries, useRCData, useProactivityData, useAllEmployees, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useRCEmployeeMap, useActiveEmployees } from '../hooks/useEmployees';
import {
  useEmployeeTargets, useSaveTargets,
  useSaveProactivity,
  useOutboundBreakdown, useSaveOutboundBreakdown,
  useTrendData, useTeamData,
} from '../hooks/useCSPerformance';
import RCUploadForm from './components/time-attendance/RCUploadForm';
import CSScorecard from './components/time-attendance/CSScorecard';
import DiscrepancyAlerts from './components/time-attendance/DiscrepancyAlerts';
import TargetsModal from './components/time-attendance/TargetsModal';
import TeamComparisonView from './components/time-attendance/TeamComparisonView';
import TrendsView from './components/time-attendance/TrendsView';
import DailyBreakdown from './components/time-attendance/DailyBreakdown';
import OutboundBreakdownForm from './components/time-attendance/OutboundBreakdownForm';
import ProducerDetailView from './components/time-attendance/ProducerDetailView';
// ScorecardPDF + @react-pdf/renderer loaded on-demand to avoid bloating the main bundle

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

// ── Role filter options ──────────────────────────────────────────────────────

const ROLE_FILTER_OPTIONS = [
  { key: 'service', label: 'Service' },
  { key: 'producer', label: 'Producers' },
  { key: 'all', label: 'All' },
];

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'individual', label: 'Individual', icon: BarChart3 },
  { key: 'team', label: 'Team', icon: Users },
];

// ── Page Component ─────────────────────────────────────────────────────────────

const CSPerformancePage = () => {
  const { user } = useAuth();
  const { platform } = usePermissions();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [activeTab, setActiveTab] = useState('individual');
  const [targetsModalOpen, setTargetsModalOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [roleFilter, setRoleFilter] = useState('service');
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

  const { data: allEmployees = [] } = useAllEmployees();
  // Active employees from employees table for dropdown
  const { data: rosterEmployees = [] } = useActiveEmployees(user?.id);
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

  const entries = timeData?.entries || [];
  const employees = timeData?.employees || [];
  const isLoading = entriesLoading || rcLoading;
  const error = entriesError;

  // Resolve the role of the currently selected employee
  const resolvedEmployeeRole = useMemo(() => {
    if (selectedEmployeeRole) return selectedEmployeeRole;
    if (!singleEmployee || !rosterEmployees.length) return 'service';
    const emp = rosterEmployees.find(
      (e) => (e.auth_user_id || e.id) === singleEmployee
    );
    return emp?.role_type || 'service';
  }, [selectedEmployeeRole, singleEmployee, rosterEmployees]);

  // Is this employee a producer?
  const isProducerView = resolvedEmployeeRole === 'producer';

  function refetchAll() {
    refetchEntries();
    refetchRC();
    refetchProactivity();
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
    const profile = employees.find((p) => p.id === userId)
      || allEmployees.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || userId?.substring(0, 8) || 'Unknown';
  }

  // ── Employee map for RC upload (uses employees.rc_display_name) ─────────

  const { data: rcEmployeeMap } = useRCEmployeeMap(user?.id);

  // Fallback to old profile-based map if employees table has no data yet
  const employeeMap = useMemo(() => {
    if (rcEmployeeMap && Object.keys(rcEmployeeMap).length > 0) return rcEmployeeMap;
    const map = {};
    const source = allEmployees.length > 0 ? allEmployees : employees;
    source.forEach((p) => {
      if (p.full_name) map[p.full_name] = p.id;
      if (p.email) map[p.email] = p.id;
    });
    return map;
  }, [rcEmployeeMap, allEmployees, employees]);

  // Prefer roster employees for dropdown (employees table); fallback to profiles
  const employeeOptions = rosterEmployees.length > 0
    ? rosterEmployees
    : (allEmployees.length > 0 ? allEmployees : employees);

  function handleRCUploaded() {
    invalidateRCData(weekStart, selectedEmployee);
  }

  // ── Proactivity save handler (uses React Query mutation + cache invalidation)

  const handleProactivityChange = useCallback((field, value) => {
    if (!singleEmployee) return;
    const current = proactivityList.find((p) => p.employee_user_id === singleEmployee);
    saveProactivity({
      org_id: user?.id,
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
                <h1 className="text-2xl font-bold text-gray-900">Performance Dashboard</h1>
                <p className="text-gray-600 text-sm">RingCentral metrics, scorecards, trends, and team comparison</p>
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

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
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
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          {/* Role filter — only in team view */}
          {activeTab === 'team' && (
            <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setRoleFilter(opt.key)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    roleFilter === opt.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  } ${opt.key !== 'service' ? 'border-l border-gray-300' : ''}`}
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
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Team
            </button>
          )}

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

          {/* Employee filter (only in individual view, not when viewing from team drill-down) */}
          {activeTab === 'individual' && !selectedEmployeeRole && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border-0 focus:ring-2 focus:ring-blue-500"
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
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit performance goals"
            >
              <Target className="w-4 h-4" />
              Goals
            </button>
          )}

          {/* Quick jump to current week */}
          <button
            onClick={() => setWeekStart(toMonday(new Date()))}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium ml-auto"
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
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4" />
                <p className="text-gray-600">Loading team data...</p>
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
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-900 mb-2">No performance data</h2>
                <p className="text-gray-600">Upload RingCentral data for this week to see producer metrics.</p>
              </div>
            ) : (
              rcData.map((rc) => {
                const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
                const isSelectedEmployee = singleEmployee === rc.employee_user_id;

                return (
                  <div key={rc.id} className="space-y-4">
                    {/* Cross-check alerts (producer-scoped) */}
                    <DiscrepancyAlerts
                      timeEntries={empEntries}
                      rcData={rc}
                      weekStart={weekStart}
                      roleType="producer"
                    />

                    {/* Producer detail view */}
                    <ProducerDetailView
                      rcData={rc}
                      employeeName={rc.employee_name || getEmployeeName(rc.employee_user_id)}
                      weekStart={weekStart}
                      trendData={isSelectedEmployee ? trendData : null}
                      targets={isSelectedEmployee ? employeeTargets : null}
                    />
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* ── Service Rep Individual View ──────────────────────────────────── */
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
                <p className="text-gray-600">Upload a RingCentral XLSX to see the scorecard.</p>
              </div>
            ) : (
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
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-gray-400" />
                        {rc.employee_name || getEmployeeName(rc.employee_user_id)}
                      </h3>
                      <button
                        onClick={() => handleDownloadPDF(rc)}
                        disabled={pdfGenerating}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
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
                      roleType="service"
                    />

                    {/* Scorecard with per-employee targets and manual proactivity */}
                    <CSScorecard
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
                        orgId={user?.id}
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
          orgId={user?.id}
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

export default CSPerformancePage;
