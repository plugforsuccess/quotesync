// src/pages/components/time-attendance/CSScorecard.jsx
// CS Performance Dashboard — Sections A, B, C + A-F weekly grade
// v2: Per-employee targets, answer rate grading, manual proactivity checkboxes

import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, CheckCircle, XCircle, Shield } from 'lucide-react';
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

function PassFailRow({ label, passed, manual }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
        {label}
        {manual && <span className="ml-1.5 text-xs text-gray-400 font-normal">(manual)</span>}
      </td>
      <td className="px-4 py-3">
        {passed ? (
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

function ManualCheckboxRow({ label, checked, onChange, disabled }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">
        {label}
        <span className="ml-1.5 text-xs text-gray-400 font-normal">(manual)</span>
      </td>
      <td className="px-4 py-3">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
          />
          <span className={`text-sm font-medium ${checked ? 'text-green-600' : 'text-gray-400'}`}>
            {checked ? 'Yes' : 'No'}
          </span>
        </label>
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
            <MetricRow label="Avg Calls/Day" target={`≥ ${t.avg_calls_per_day}`} actual={metrics.avgCallsPerDay.toFixed(1)} />
            <MetricRow label="Talk Time" target="≥ 8" actual={metrics.talkTimeHours.toFixed(1)} unit="h" />
            <MetricRow
              label="Avg Handle Time"
              target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
              actual={(rcData.avg_handle_time_minutes || 0).toFixed(1)}
              unit=" min"
            />
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
              actual={(rcData.avg_speed_of_answer_seconds || 0).toFixed(0)}
              unit="s"
              inverse
            />
            <MetricRow
              label="Avg Handle Time"
              target={`${t.avg_handle_time_min_low}–${t.avg_handle_time_min_high}`}
              actual={(rcData.avg_handle_time_minutes || 0).toFixed(1)}
              unit=" min"
            />
            <MetricRow
              label="Avg Hold Time"
              target={`< ${t.avg_hold_time_min}`}
              actual={(rcData.avg_hold_time_minutes || 0).toFixed(1)}
              unit=" min"
              inverse
            />
            <MetricRow
              label="Transfer Rate"
              target={`< ${t.transfer_rate_pct}`}
              actual={metrics.transferRate.toFixed(1)}
              unit="%"
              inverse
            />
            <MetricRow
              label="Missed Call Rate"
              target={`< ${t.missed_call_rate_pct}`}
              actual={metrics.missedCallRate.toFixed(1)}
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
            {/* Auto-computed flags */}
            <PassFailRow label="Outbound Every Day" passed={metrics.outboundEveryDay} />
            <PassFailRow label="No 0-Call Days" passed={!metrics.hasZeroCallDays} />

            {/* Manual checkbox flags */}
            <ManualCheckboxRow
              label="Follow-Up Notes Logged"
              checked={proactivity?.followup_notes_logged || false}
              onChange={(checked) => onProactivityChange?.('followup_notes_logged', checked)}
              disabled={savingProactivity}
            />
            <ManualCheckboxRow
              label="Queue Participation"
              checked={proactivity?.queue_participation || false}
              onChange={(checked) => onProactivityChange?.('queue_participation', checked)}
              disabled={savingProactivity}
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
