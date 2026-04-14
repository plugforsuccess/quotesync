// src/pages/components/time-attendance/StaffScorecard.jsx
// CS Performance Dashboard — Sections A (Activity), B (Efficiency & Quality),
// C (Queue Breakdown), D (Proactivity) + A-F weekly grade.
// v3: Call log as primary data source, summary report as optional supplement.

import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, CheckCircle, XCircle, Shield, Edit3, BarChart2, Info } from 'lucide-react';
import { GRADE_CONFIG, DEFAULT_TARGETS, calculateGrade, computeMetrics, classifyWeek } from '../../../config/staffPerformanceDefaults';
import { computeAttendance } from '../../../lib/attendanceUtils';

// ── Metric Display Components ──────────────────────────────────────────────────

function MetricRow({ label, target, actual, unit, inverse, source }) {
  const numActual = parseFloat(actual) || 0;
  const isRange = typeof target === 'string' && target.includes('–');

  let status = 'neutral';
  if (target && target !== 'Track only') {
    if (isRange) {
      const [lo, hi] = target.split('–').map((v) => parseFloat(v));
      if (numActual >= lo && numActual <= hi) status = 'good';
      else if (numActual < lo) status = inverse ? 'good' : 'bad';
      else status = inverse ? 'bad' : 'good';
    } else {
      const targetNum = parseFloat(target.replace(/[^0-9.]/g, ''));
      if (!isNaN(targetNum)) {
        const isLt = target.startsWith('<');
        if (isLt) {
          status = numActual < targetNum ? 'good' : 'bad';
        } else {
          status = numActual >= targetNum ? 'good' : 'bad';
        }
      }
    }
  }

  const statusColors = {
    good: 'text-emerald-400',
    bad: 'text-red-400',
    neutral: 'text-qs-dim',
  };

  return (
    <tr className="hover:bg-qs-elevated transition-colors">
      <td className="px-4 py-3 text-sm text-qs-bright font-medium">
        {label}
        {source && (
          <span className="ml-1.5 text-xs text-qs-muted" title={`Source: ${source}`}>
            ({source})
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-qs-subtle">{target || '-'}</td>
      <td className={`px-4 py-3 text-sm font-semibold ${statusColors[status]}`}>
        {actual != null && actual !== '—' ? `${actual}${unit || ''}` : '—'}
      </td>
      <td className="px-4 py-3">
        {status === 'good' && <TrendingUp className="w-4 h-4 text-green-500" />}
        {status === 'bad' && <TrendingDown className="w-4 h-4 text-red-500" />}
      </td>
    </tr>
  );
}

function PassFailRow({ label, passed, manual, onToggle }) {
  return (
    <tr className="hover:bg-qs-elevated transition-colors">
      <td className="px-4 py-3 text-sm text-qs-bright font-medium">
        {label}
        {manual && <span className="ml-1.5 text-xs text-qs-muted">(manual)</span>}
      </td>
      <td className="px-4 py-3">
        {manual && onToggle ? (
          <button
            onClick={onToggle}
            className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded transition-colors ${
              passed
                ? 'text-emerald-400 bg-emerald-900/20 hover:bg-emerald-900/30'
                : 'text-red-400 bg-red-900/20 hover:bg-red-900/30'
            }`}
          >
            {passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {passed ? 'Pass' : 'Fail'}
            <Edit3 className="w-3 h-3 ml-1 text-qs-muted" />
          </button>
        ) : passed ? (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-400 font-medium">
            <CheckCircle className="w-4 h-4" /> Pass
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-red-400 font-medium">
            <XCircle className="w-4 h-4" /> Fail
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Main Scorecard ─────────────────────────────────────────────────────────────

export default function StaffScorecard({
  rcData,
  callLogMetrics,
  weekEntries,
  weekStart,
  daysWorked,
  targets,
  proactivity,
  onProactivityChange,
  savingProactivity,
  ytdEntries,
  hireDate,
  currentYear,
  ptoDaysPerYear,
}) {
  const hasCallLog = callLogMetrics && callLogMetrics.totalCalls > 0;
  const hasRCData = !!rcData;

  // Classify the week from attendance entries — drives whether we grade,
  // whether targets are prorated, and which banner to show.
  const weekContext = classifyWeek(weekEntries || [], weekStart || '');
  const {
    classification,
    proratedTargetFactor,
    workedDays,
    ptoDays,
    sickDays,
    holidayDays,
  } = weekContext;
  const isUngradedWeek = ['full_pto', 'full_sick', 'full_absence'].includes(classification);

  if (!hasCallLog && !hasRCData) {
    return (
      <div className="bg-qs-card rounded-lg border border-qs-border p-8 text-center">
        <Activity className="w-12 h-12 text-qs-muted mx-auto mb-3" />
        <p className="text-qs-subtle">No performance data available for this week.</p>
        {classification === 'no_entries' ? (
          <p className="text-sm text-qs-muted mt-1">
            No attendance entries logged. Upload a call log or enter time to see the scorecard.
          </p>
        ) : isUngradedWeek ? (
          <p className="text-sm text-qs-muted mt-1">
            Absence week — no grading required.
          </p>
        ) : (
          <p className="text-sm text-qs-muted mt-1">Upload a call log or RingCentral XLSX to see the scorecard.</p>
        )}
      </div>
    );
  }

  const t = { ...DEFAULT_TARGETS, ...targets };
  const clm = callLogMetrics || {};

  // Compute grade: use call log metrics if available, otherwise fall back to RC summary.
  // Skip grading entirely for full-absence weeks (PTO / sick / other).
  let grade = null;
  if (!isUngradedWeek) {
    if (hasCallLog) {
      grade = calculateGrade(clm, null, t, proratedTargetFactor);
    } else if (hasRCData) {
      const legacyMetrics = computeMetrics(rcData, daysWorked);
      grade = calculateGrade(
        rcData.outbound_calls,
        legacyMetrics.answerRate,
        legacyMetrics.hasZeroCallDays,
        t,
        proratedTargetFactor,
      );
    }
  }
  const gradeConfig = grade ? GRADE_CONFIG[grade] : null;

  // Summary-only metrics (speed of answer, hold time) — from rcData if available
  const avgSpeedOfAnswer = rcData?.avg_speed_of_answer_seconds || null;
  const avgHoldTime = rcData?.avg_hold_time_minutes || null;

  // Choose data source for each metric
  const totalCalls = hasCallLog ? clm.totalCalls : (rcData?.total_calls || 0);
  const outboundAttempts = hasCallLog ? clm.outboundAttempts : (rcData?.outbound_calls || 0);
  const outboundConnected = hasCallLog ? clm.outboundConnected : null;
  const outboundConnectRate = hasCallLog ? clm.outboundConnectRate : null;
  const avgCallsPerDay = hasCallLog ? clm.avgCallsPerDay : (rcData?.avg_calls_per_day || 0);
  const outboundEveryDay = hasCallLog ? clm.outboundEveryDay : false;
  const answerRate = hasCallLog ? clm.answerRate : (rcData ? computeMetrics(rcData, daysWorked).answerRate : NaN);
  const inboundMissed = hasCallLog ? clm.inboundMissed : (rcData?.missed_calls || 0);
  const avgHandleTime = hasCallLog ? clm.avgHandleTimeMin : (rcData?.avg_handle_time_minutes || 0);
  const hasLongCall = hasCallLog ? clm.hasLongCall : false;
  const longestCall = hasCallLog ? clm.longestCall : null;
  const hasZeroCallDays = hasCallLog ? clm.hasZeroCallDays : false;

  const employeeName = rcData?.employee_name || (hasCallLog ? 'Employee' : '');

  // YTD Attendance
  const ytdStart = `${currentYear}-01-01`;
  const ytdEnd   = `${currentYear}-12-31`;
  const ytdAttendance = computeAttendance(
    null,
    hireDate || null,
    ytdEntries || [],
    ytdStart,
    ytdEnd
  );
  const hasAttendanceData = (ytdEntries || []).length > 0;

  // PTO balance — front-loaded annual allotment minus YTD used
  const ptoAllotment = ptoDaysPerYear ?? 10;
  const ptoUsed = ytdAttendance.pto || 0;
  const ptoRemaining = Math.max(0, ptoAllotment - ptoUsed);
  const ptoColor =
    ptoRemaining <= 0  ? '#EF4444'
    : ptoRemaining <= 2 ? '#EF4444'
    : ptoRemaining <= 5 ? '#F59E0B'
    : '#10B981';

  // Human-readable summary for the full_absence banner
  const absenceParts = [];
  if (ptoDays > 0) absenceParts.push(`${ptoDays} PTO`);
  if (sickDays > 0) absenceParts.push(`${sickDays} sick`);
  if (holidayDays > 0) absenceParts.push(`${holidayDays} holiday`);

  return (
    <div className="space-y-6">
      {/* Grade Banner — absence-aware */}
      {isUngradedWeek ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px', borderRadius: 8,
          background: classification === 'full_sick'
            ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
          border: `1px solid ${classification === 'full_sick'
            ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}`,
        }}>
          <div>
            <h3 className="text-lg font-semibold text-qs-bright">
              {classification === 'full_pto'     && 'PTO Week'}
              {classification === 'full_sick'    && 'Sick Week'}
              {classification === 'full_absence' && 'Absence Week'}
            </h3>
            <p style={{ fontSize: 13, marginTop: 4, color: 'var(--qs-dim)' }}>
              {classification === 'full_pto' &&
                `${ptoDays} PTO day${ptoDays !== 1 ? 's' : ''} — no calls expected. Week not graded.`}
              {classification === 'full_sick' &&
                `${sickDays} sick day${sickDays !== 1 ? 's' : ''} — no calls expected. Week not graded.`}
              {classification === 'full_absence' &&
                `${absenceParts.join(', ')} — week not graded.`}
            </p>
            {employeeName && (
              <p className="text-xs text-qs-subtle mt-1">{employeeName}</p>
            )}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--qs-muted)' }}>
            Not Graded
          </span>
        </div>
      ) : (
        <div className={`flex items-center justify-between p-6 rounded-lg border-2 ${gradeConfig.bg} ${gradeConfig.border}`}>
          <div>
            <h3 className="text-lg font-semibold text-qs-bright">Weekly Performance Grade</h3>
            <p className={`text-sm ${gradeConfig.color}`}>{gradeConfig.desc}</p>
            {employeeName && (
              <p className="text-xs text-qs-subtle mt-1">
                {employeeName}
                {(() => {
                  const wfhPct = ytdAttendance.daysWorked > 0
                    ? (ytdAttendance.wfh / ytdAttendance.daysWorked) * 100
                    : 0;
                  return wfhPct > 10 ? (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: '2px 6px', borderRadius: 4,
                      background: '#F59E0B22', border: '1px solid #F59E0B44',
                      color: '#F59E0B', marginLeft: 6,
                    }}>
                      WFH {Math.round(wfhPct)}%
                    </span>
                  ) : null;
                })()}
              </p>
            )}
            {hasCallLog && (
              <p className="text-xs text-primary-500 mt-0.5">Based on call log data</p>
            )}
            {classification === 'partial_absence' && (
              <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 6 }}>
                Partial week — targets prorated to {workedDays} worked day{workedDays !== 1 ? 's' : ''}.
                {ptoDays > 0 && ` ${ptoDays} PTO.`}
                {sickDays > 0 && ` ${sickDays} sick.`}
              </p>
            )}
            {classification === 'holiday_reduced' && (
              <p style={{ fontSize: 11, color: 'var(--qs-muted)', marginTop: 6 }}>
                Holiday week — targets prorated to {workedDays} worked day{workedDays !== 1 ? 's' : ''}.
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Award className={`w-8 h-8 ${gradeConfig.color}`} />
            <span className={`text-5xl font-bold ${gradeConfig.color}`}>{grade}</span>
          </div>
        </div>
      )}

      {/* Section A: Activity Metrics */}
      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
          <Phone className="w-5 h-5 text-primary-400" />
          <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Section A — Activity</h4>
        </div>
        <table className="w-full">
          <thead className="bg-qs-elevated/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Actual</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            <MetricRow label="Total Calls" target="Track only" actual={totalCalls} />
            <MetricRow label="Outbound Attempts" target={`≥ ${t.outbound_calls_weekly}`} actual={outboundAttempts} />
            {outboundConnected != null && (
              <MetricRow label="Outbound Connected" target="Track only" actual={outboundConnected} />
            )}
            {outboundConnectRate != null && (
              <MetricRow label="Outbound Connect Rate" target="Track only" actual={outboundConnectRate.toFixed(1)} unit="%" />
            )}
            <MetricRow label="Avg Calls/Day" target={`≥ ${t.avg_calls_per_day}`} actual={typeof avgCallsPerDay === 'number' ? avgCallsPerDay.toFixed(1) : avgCallsPerDay} />
            <PassFailRow label="Outbound Every Day" passed={outboundEveryDay} />
          </tbody>
        </table>
      </div>

      {/* Section B: Efficiency & Quality */}
      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary-400" />
          <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Section B — Efficiency & Quality</h4>
        </div>
        <table className="w-full">
          <thead className="bg-qs-elevated/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Actual</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            <MetricRow
              label="Inbound Answer Rate"
              target={`≥ ${t.answer_rate_pct}`}
              actual={isFinite(answerRate) ? answerRate.toFixed(1) : '—'}
              unit={isFinite(answerRate) ? '%' : ''}
              source={hasCallLog ? 'call log' : 'summary'}
            />
            <MetricRow
              label="Inbound Missed"
              target="Track only"
              actual={inboundMissed}
              source={hasCallLog ? 'call log' : 'summary'}
            />
            <MetricRow
              label="Avg Handle Time"
              target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
              actual={avgHandleTime.toFixed(1)}
              unit=" min"
              source={hasCallLog ? 'call log' : 'summary'}
            />
            <MetricRow
              label="Avg Speed of Answer"
              target={`< ${t.avg_speed_of_answer_sec}`}
              actual={avgSpeedOfAnswer != null ? avgSpeedOfAnswer.toFixed(0) : '—'}
              unit={avgSpeedOfAnswer != null ? 's' : ''}
              inverse
              source="summary"
            />
            <MetricRow
              label="Avg Hold Time"
              target={`< ${t.avg_hold_time_min}`}
              actual={avgHoldTime != null ? avgHoldTime.toFixed(1) : '—'}
              unit={avgHoldTime != null ? ' min' : ''}
              inverse
              source="summary"
            />
            {hasLongCall && longestCall && (
              <tr className="hover:bg-qs-elevated transition-colors bg-amber-900/10">
                <td className="px-4 py-3 text-sm text-amber-300 font-medium">
                  Longest Call Flag
                  <span className="ml-1.5 text-xs text-amber-400">(30+ min)</span>
                </td>
                <td className="px-4 py-3 text-sm text-amber-400">
                  {Math.floor(longestCall.call_length_seconds / 60)}:{String(longestCall.call_length_seconds % 60).padStart(2, '0')} min
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Section C: Queue Breakdown (new — from call log) */}
      {hasCallLog && (clm.salesCalls > 0 || clm.serviceCalls > 0) && (
        <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
          <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-primary-400" />
            <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Section C — Queue Breakdown</h4>
            <span className="text-xs text-qs-muted ml-auto flex items-center gap-1">
              <Info className="w-3 h-3" /> Baseline tracking — no grade impact
            </span>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-qs-text">Sales</span>
                  <span className="text-sm text-qs-dim">{clm.salesCalls} ({clm.salesPct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-qs-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${clm.salesPct}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-qs-text">Service</span>
                  <span className="text-sm text-qs-dim">{clm.serviceCalls} ({clm.servicePct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-qs-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${clm.servicePct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section D: Proactivity Score */}
      <div className="bg-qs-card rounded-lg border border-qs-border overflow-hidden">
        <div className="px-4 py-3 bg-qs-elevated border-b border-qs-border flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary-400" />
          <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide">Section D — Proactivity</h4>
        </div>
        <table className="w-full">
          <thead className="bg-qs-elevated/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Category</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-qs-subtle uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-qs-border">
            <PassFailRow label="Outbound Every Day" passed={outboundEveryDay} />
            <PassFailRow label="No 0-Call Days" passed={!hasZeroCallDays} />
            <PassFailRow
              label="Follow-Up Notes Logged"
              passed={proactivity?.follow_up_notes_logged || false}
              manual
              onToggle={onProactivityChange && !savingProactivity
                ? () => onProactivityChange('follow_up_notes_logged', !proactivity?.follow_up_notes_logged)
                : null}
            />
            <PassFailRow
              label="Queue Participation"
              passed={proactivity?.queue_participation || false}
              manual
              onToggle={onProactivityChange && !savingProactivity
                ? () => onProactivityChange('queue_participation', !proactivity?.queue_participation)
                : null}
            />
          </tbody>
        </table>
      </div>

      {/* Outbound Call Expectations */}
      <div className="bg-qs-card rounded-lg border border-qs-border p-4">
        <h4 className="text-sm font-semibold text-qs-bright mb-3">Outbound Call Expectations</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-qs-elevated rounded-lg">
            <p className="text-xs text-qs-subtle uppercase font-medium">Current Target</p>
            <p className="text-lg font-bold text-qs-bright mt-1">
              {Math.round(t.outbound_calls_weekly / 5)}/day &middot; {t.outbound_calls_weekly}/week
            </p>
          </div>
          <div className="p-3 bg-primary-900/20 rounded-lg">
            <p className="text-xs text-primary-500 uppercase font-medium">Grade A Threshold</p>
            <p className="text-lg font-bold text-primary-300 mt-1">
              {Math.round(t.grade_a_outbound / 5)}/day &middot; {t.grade_a_outbound}/week
            </p>
          </div>
        </div>
      </div>

      {/* YTD Attendance */}
      {hasAttendanceData && (
        <div className="bg-qs-card rounded-lg border border-qs-border p-4">
          <p className="text-xs font-medium text-qs-subtle uppercase tracking-wide mb-3">
            YTD Attendance ({currentYear})
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.daysWorked}</p>
              <p className="text-xs text-qs-subtle mt-0.5">Days Worked</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${ytdAttendance.wfh > 0 ? 'text-amber-400' : 'text-qs-bright'}`}>
                {ytdAttendance.wfh}
              </p>
              <p className="text-xs text-qs-subtle mt-0.5">WFH</p>
              <p className="text-xs text-qs-subtle mt-0.5">
                {ytdAttendance.daysWorked > 0
                  ? `${Math.round((ytdAttendance.wfh / ytdAttendance.daysWorked) * 100)}% of days`
                  : 'days'}
              </p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${ytdAttendance.sick > 0 ? 'text-amber-400' : 'text-qs-bright'}`}>
                {ytdAttendance.sick}
              </p>
              <p className="text-xs text-qs-subtle mt-0.5">Sick</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${ytdAttendance.pto > 0 ? 'text-blue-400' : 'text-qs-bright'}`}>
                {ytdAttendance.pto}
              </p>
              <p className="text-xs text-qs-subtle mt-0.5">PTO</p>
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: ptoColor }}>
                {ptoRemaining} / {ptoAllotment} days
              </p>
              <p className="text-xs text-qs-subtle mt-0.5">PTO Remaining</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.appt}</p>
              <p className="text-xs text-qs-subtle mt-0.5">Appt</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-qs-bright">{ytdAttendance.early}</p>
              <p className="text-xs text-qs-subtle mt-0.5">Early Out</p>
            </div>
            <div>
              <p className={`text-2xl font-bold ${ytdAttendance.unexcused > 0 ? 'text-red-400' : 'text-qs-bright'}`}>
                {ytdAttendance.unexcused}
              </p>
              <p className="text-xs text-qs-subtle mt-0.5">Unexcused</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
