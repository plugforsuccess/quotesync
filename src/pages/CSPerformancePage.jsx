// src/pages/CSPerformancePage.jsx
// CS Performance Dashboard v2 — Individual scorecard, Team comparison, Trends,
// Daily breakdown, Outbound breakdown, PDF export, per-employee goals.
// Route: /admin/cs-performance
// Access: platform_master_admin, platform_admin only

import { useState, useMemo, useCallback } from 'react';
import {
  BarChart3, Users, RefreshCw, AlertCircle, ChevronLeft, ChevronRight,
  Filter, Target, Download,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTimeEntries, useRCData, useAllEmployees, useInvalidateTimeData } from '../hooks/useTimeAttendance';
import { useInvalidateAlertCount } from '../hooks/useAlertCount';
import {
  useEmployeeTargets, useSaveTargets,
  useProactivityManual, useSaveProactivity,
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

// ── Tab definitions ────────────────────────────────────────────────────────────

const TABS = [
  { key: 'individual', label: 'Individual', icon: BarChart3 },
  { key: 'team', label: 'Team', icon: Users },
];

// ── Page Component ─────────────────────────────────────────────────────────────

const CSPerformancePage = () => {
  const { user, currentAgencyId } = useAuth();
  const { platform } = usePermissions();

  const [weekStart, setWeekStart] = useState(() => toMonday(new Date()));
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [activeTab, setActiveTab] = useState('individual');
  const [targetsModalOpen, setTargetsModalOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);

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

  const { data: allEmployees = [] } = useAllEmployees();
  const { invalidateRCData } = useInvalidateTimeData();
  const { invalidateAlertCount } = useInvalidateAlertCount();

  // v2 hooks — only for individual view with a single employee selected
  const singleEmployee = selectedEmployee !== 'all' ? selectedEmployee : (rcData.length === 1 ? rcData[0]?.employee_user_id : null);

  const { data: employeeTargets } = useEmployeeTargets(singleEmployee, weekStart);
  const { mutate: saveTargets, isPending: savingTargets } = useSaveTargets();
  const { data: proactivityData } = useProactivityManual(singleEmployee, weekStart);
  const { mutate: saveProactivity, isPending: savingProactivity } = useSaveProactivity();
  const { data: outboundBreakdownData } = useOutboundBreakdown(singleEmployee, weekStart);
  const { mutate: saveOutboundBreakdown, isPending: savingOutboundBreakdown } = useSaveOutboundBreakdown();
  const { data: trendData } = useTrendData(singleEmployee, weekStart);
  const { data: teamData, isLoading: teamLoading } = useTeamData(weekStart);

  const entries = timeData?.entries || [];
  const employees = timeData?.employees || [];
  const isLoading = entriesLoading || rcLoading;
  const error = entriesError;

  function refetchAll() {
    refetchEntries();
    refetchRC();
  }

  // ── Employee name resolver ───────────────────────────────────────────────

  function getEmployeeName(userId) {
    const profile = employees.find((p) => p.id === userId)
      || allEmployees.find((p) => p.id === userId);
    return profile?.full_name || profile?.email || userId?.substring(0, 8) || 'Unknown';
  }

  // ── Employee map for RC upload ───────────────────────────────────────────

  const employeeMap = useMemo(() => {
    const map = {};
    const source = allEmployees.length > 0 ? allEmployees : employees;
    source.forEach((p) => {
      if (p.full_name) map[p.full_name] = p.id;
      if (p.email) map[p.email] = p.id;
    });
    return map;
  }, [allEmployees, employees]);

  const employeeOptions = allEmployees.length > 0 ? allEmployees : employees;

  function handleRCUploaded() {
    invalidateRCData(weekStart, selectedEmployee);
    // Edge Function detection has already completed by the time onUploaded fires,
    // so invalidate the badge count immediately.
    invalidateAlertCount();
  }

  // ── Proactivity save handler ─────────────────────────────────────────────

  const handleProactivityChange = useCallback((field, value) => {
    if (!singleEmployee) return;
    saveProactivity({
      org_id: currentAgencyId,
      employee_user_id: singleEmployee,
      week_start: weekStart,
      followup_notes_logged: field === 'followup_notes_logged' ? value : (proactivityData?.followup_notes_logged || false),
      queue_participation: field === 'queue_participation' ? value : (proactivityData?.queue_participation || false),
      updated_by: user?.id,
    });
  }, [singleEmployee, weekStart, user, currentAgencyId, proactivityData, saveProactivity]);

  // ── PDF export handler ───────────────────────────────────────────────────

  async function handleDownloadPDF(rc) {
    setPdfGenerating(true);
    try {
      // Dynamic import — @react-pdf/renderer only loaded when user clicks download
      const [{ pdf }, { default: ScorecardPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./components/time-attendance/ScorecardPDF'),
      ]);

      const empEntries = entries.filter((e) => e.employee_user_id === rc.employee_user_id);
      const daysWorked = empEntries.filter((e) => ['REG', 'WFH'].includes(e.code)).length || 5;

      const blob = await pdf(
        <ScorecardPDF
          rcData={rc}
          daysWorked={daysWorked}
          targets={employeeTargets}
          proactivity={proactivityData}
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

  function handleSelectEmployeeFromTeam(employeeId) {
    setSelectedEmployee(employeeId);
    setActiveTab('individual');
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
                <h1 className="text-2xl font-bold text-gray-900">CS Performance Dashboard</h1>
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

          {/* Employee filter (only in individual view) */}
          {activeTab === 'individual' && (
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

              {/* Goals button — only for single employee */}
              {singleEmployee && (
                <button
                  onClick={() => setTargetsModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit performance goals"
                >
                  <Target className="w-4 h-4" />
                  Goals
                </button>
              )}
            </div>
          )}

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
                onSelectEmployee={handleSelectEmployeeFromTeam}
              />
            )}
          </div>
        ) : (
          /* ── Individual View ────────────────────────────────────────────── */
          <div className="space-y-6">
            {/* RC Upload */}
            <RCUploadForm
              orgId={currentAgencyId}
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
                      employeeId={rc.employee_user_id}
                    />

                    {/* Scorecard with per-employee targets and manual proactivity */}
                    <CSScorecard
                      rcData={rc}
                      daysWorked={daysWorked || 5}
                      targets={isSelectedEmployee ? employeeTargets : null}
                      proactivity={isSelectedEmployee ? proactivityData : null}
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
