// src/pages/components/time-attendance/CSScorecard.jsx
// CS Performance Dashboard — Sections A (Activity), B (Efficiency & Quality),
// C (Queue Breakdown), D (Proactivity) + A-F weekly grade.
// v3: Call log as primary data source, summary report as optional supplement.

import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, CheckCircle, XCircle, Shield, Edit3, BarChart2, Info } from 'lucide-react';
import { GRADE_CONFIG, DEFAULT_TARGETS, calculateGrade, computeMetrics } from '../../../config/csPerformanceDefaults';

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
    good: 'text-green-600',
    bad: 'text-red-600',
    neutral: 'text-gray-600',
  };

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
        {label}
        {source && (
          <span className="ml-1.5 text-xs text-gray-400" title={`Source: ${source}`}>
            ({source})
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{target || '-'}</td>
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
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
        {label}
        {manual && <span className="ml-1.5 text-xs text-gray-400">(manual)</span>}
      </td>
      <td className="px-4 py-3">
        {manual && onToggle ? (
          <button
            onClick={onToggle}
            className={`inline-flex items-center gap-1 text-sm font-medium px-2 py-1 rounded transition-colors ${
              passed
                ? 'text-green-600 bg-green-50 hover:bg-green-100'
                : 'text-red-600 bg-red-50 hover:bg-red-100'
            }`}
          >
            {passed ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {passed ? 'Pass' : 'Fail'}
            <Edit3 className="w-3 h-3 ml-1 text-gray-400" />
          </button>
        ) : passed ? (
          <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
            <CheckCircle className="w-4 h-4" /> Pass
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-red-600 font-medium">
            <XCircle className="w-4 h-4" /> Fail
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Main Scorecard ─────────────────────────────────────────────────────────────

export default function CSScorecard({
  rcData,
  callLogMetrics,
  daysWorked,
  targets,
  proactivity,
  onProactivityChange,
  savingProactivity,
}) {
  const hasCallLog = callLogMetrics && callLogMetrics.totalCalls > 0;
  const hasRCData = !!rcData;

  if (!hasCallLog && !hasRCData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No performance data available for this week.</p>
        <p className="text-sm text-gray-400 mt-1">Upload a call log or RingCentral XLSX to see the scorecard.</p>
      </div>
    );
  }

  const t = { ...DEFAULT_TARGETS, ...targets };
  const clm = callLogMetrics || {};

  // Compute grade: use call log metrics if available, otherwise fall back to RC summary
  let grade;
  if (hasCallLog) {
    grade = calculateGrade(clm, null, t);
  } else {
    const legacyMetrics = computeMetrics(rcData, daysWorked);
    grade = calculateGrade(rcData.outbound_calls, legacyMetrics.answerRate, legacyMetrics.hasZeroCallDays, t);
  }
  const gradeConfig = GRADE_CONFIG[grade];

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

  return (
    <div className="space-y-6">
      {/* Grade Banner */}
      <div className={`flex items-center justify-between p-6 rounded-lg border-2 ${gradeConfig.bg} ${gradeConfig.border}`}>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Weekly Performance Grade</h3>
          <p className={`text-sm ${gradeConfig.color}`}>{gradeConfig.desc}</p>
          {employeeName && <p className="text-xs text-gray-500 mt-1">{employeeName}</p>}
          {hasCallLog && (
            <p className="text-xs text-blue-500 mt-0.5">Based on call log data</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Award className={`w-8 h-8 ${gradeConfig.color}`} />
          <span className={`text-5xl font-bold ${gradeConfig.color}`}>{grade}</span>
        </div>
      </div>

      {/* Section A: Activity Metrics */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Phone className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section A — Activity</h4>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Actual</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section B — Efficiency & Quality</h4>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Metric</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Target</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Actual</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
              <tr className="hover:bg-gray-50 transition-colors bg-amber-50/50">
                <td className="px-4 py-3 text-sm text-amber-700 font-medium">
                  Longest Call Flag
                  <span className="ml-1.5 text-xs text-amber-500">(30+ min)</span>
                </td>
                <td className="px-4 py-3 text-sm text-amber-600">
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
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" />
            <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section C — Queue Breakdown</h4>
            <span className="text-xs text-gray-400 ml-auto flex items-center gap-1">
              <Info className="w-3 h-3" /> Baseline tracking — no grade impact
            </span>
          </div>
          <div className="p-4">
            <div className="flex items-center gap-6">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">Sales</span>
                  <span className="text-sm text-gray-600">{clm.salesCalls} ({clm.salesPct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{ width: `${clm.salesPct}%` }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">Service</span>
                  <span className="text-sm text-gray-600">{clm.serviceCalls} ({clm.servicePct.toFixed(0)}%)</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
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
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section D — Proactivity</h4>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Outbound Call Expectations</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 uppercase font-medium">Current Target</p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {Math.round(t.outbound_calls_weekly / 5)}/day &middot; {t.outbound_calls_weekly}/week
            </p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-500 uppercase font-medium">Grade A Threshold</p>
            <p className="text-lg font-bold text-blue-900 mt-1">
              {Math.round(t.grade_a_outbound / 5)}/day &middot; {t.grade_a_outbound}/week
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
