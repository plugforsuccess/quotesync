// src/pages/components/time-attendance/CSScorecard.jsx
// CS Performance Dashboard — Sections A (Activity), B (Efficiency & Quality),
// C (Proactivity) + A-F weekly grade.
// v2: Per-employee targets, answer rate grading, manual proactivity checkboxes.
// Column names match the rc_performance_redesign migration (XLSX-based schema).

import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, CheckCircle, XCircle, Shield, Edit3 } from 'lucide-react';
import { GRADE_CONFIG, DEFAULT_TARGETS, calculateGrade, computeMetrics } from '../../../config/csPerformanceDefaults';

// ── Metric Display Components ──────────────────────────────────────────────────

function MetricRow({ label, target, actual, unit, inverse }) {
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
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{label}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{target || '-'}</td>
      <td className={`px-4 py-3 text-sm font-semibold ${statusColors[status]}`}>
        {actual != null ? `${actual}${unit || ''}` : '-'}
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
  daysWorked,
  targets,
  proactivity,
  onProactivityChange,
  savingProactivity,
}) {
  if (!rcData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No RingCentral data available for this week.</p>
        <p className="text-sm text-gray-400 mt-1">Upload an XLSX to see the performance scorecard.</p>
      </div>
    );
  }

  const t = { ...DEFAULT_TARGETS, ...targets };
  const metrics = computeMetrics(rcData, daysWorked);
  const grade = calculateGrade(rcData.outbound_calls, metrics.answerRate, metrics.hasZeroCallDays, t);
  const gradeConfig = GRADE_CONFIG[grade];

  // Direct columns from RC data (pre-computed by RC or upload)
  const avgCallsPerDay = rcData.avg_calls_per_day || metrics.avgCallsPerDay;
  const avgHandleTime = rcData.avg_handle_time_minutes || 0;
  const avgHoldTime = rcData.avg_hold_time_minutes || 0;
  const avgSpeedOfAnswer = rcData.avg_speed_of_answer_seconds || 0;
  const totalHandleTimeHours = (rcData.total_handle_time_minutes || 0) / 60;

  // Use direct pct columns if available (from RC export), else compute
  const transferRate = rcData.transfer_pct != null && rcData.transfer_pct > 0
    ? rcData.transfer_pct
    : metrics.transferRate;
  const missedRate = rcData.missed_pct != null && rcData.missed_pct > 0
    ? rcData.missed_pct
    : metrics.missedCallRate;

  return (
    <div className="space-y-6">
      {/* Grade Banner */}
      <div className={`flex items-center justify-between p-6 rounded-lg border-2 ${gradeConfig.bg} ${gradeConfig.border}`}>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Weekly Performance Grade</h3>
          <p className={`text-sm ${gradeConfig.color}`}>{gradeConfig.desc}</p>
          <p className="text-xs text-gray-500 mt-1">{rcData.employee_name}</p>
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
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section A — Activity Metrics</h4>
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
            <MetricRow label="Total Calls" target={`≥ ${t.total_calls_weekly}`} actual={rcData.total_calls} />
            <MetricRow label="Inbound Calls" target="Track only" actual={rcData.inbound_calls} />
            <MetricRow label="Outbound Calls" target={`≥ ${t.outbound_calls_weekly}`} actual={rcData.outbound_calls} />
            <MetricRow label="Avg Calls/Day" target={`≥ ${t.avg_calls_per_day}`} actual={typeof avgCallsPerDay === 'number' ? avgCallsPerDay.toFixed(1) : avgCallsPerDay} />
            <MetricRow label="Answered Calls" target="Track only" actual={rcData.answered_calls} />
            <MetricRow
              label="Avg Handle Time"
              target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
              actual={avgHandleTime.toFixed(1)}
              unit=" min"
            />
            <MetricRow label="Total Handle Time" target="Track only" actual={totalHandleTimeHours.toFixed(1)} unit="h" />
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
              label="Answer Rate"
              target={`≥ ${t.answer_rate_pct}`}
              actual={isFinite(metrics.answerRate) ? metrics.answerRate.toFixed(1) : 'N/A'}
              unit={isFinite(metrics.answerRate) ? '%' : ''}
            />
            <MetricRow
              label="Avg Speed of Answer"
              target={`< ${t.avg_speed_of_answer_sec}`}
              actual={avgSpeedOfAnswer.toFixed(0)}
              unit="s"
              inverse
            />
            <MetricRow
              label="Avg Handle Time"
              target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
              actual={avgHandleTime.toFixed(1)}
              unit=" min"
            />
            <MetricRow
              label="Avg Hold Time"
              target={`< ${t.avg_hold_time_min}`}
              actual={avgHoldTime.toFixed(1)}
              unit=" min"
              inverse
            />
            <MetricRow
              label="Transfer Rate"
              target={`< ${t.transfer_rate_pct}`}
              actual={typeof transferRate === 'number' ? transferRate.toFixed(1) : transferRate}
              unit="%"
              inverse
            />
            <MetricRow
              label="Missed Call Rate"
              target={`< ${t.missed_call_rate_pct}`}
              actual={typeof missedRate === 'number' ? missedRate.toFixed(1) : missedRate}
              unit="%"
              inverse
            />
          </tbody>
        </table>
      </div>

      {/* Section C: Proactivity Score */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section C — Proactivity Score</h4>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50/50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Category</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            <PassFailRow label="Outbound Every Day" passed={metrics.outboundEveryDay} />
            <PassFailRow label="No 0-Call Days" passed={!metrics.hasZeroCallDays} />
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
