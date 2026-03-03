// src/pages/components/time-attendance/CSScorecard.jsx
// CS Performance Dashboard — Sections A, B, C + A-F weekly grade

import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

// ── Grading Logic ──────────────────────────────────────────────────────────────

function calculateGrade(outboundCalls, utilization, hasZeroCallDays) {
  if (utilization < 10 || hasZeroCallDays) return 'F';
  if (outboundCalls < 30 || utilization < 15) return 'D';
  if (outboundCalls >= 60 && utilization >= 25 && !hasZeroCallDays) return 'A';
  if (outboundCalls >= 40 && utilization >= 20) return 'B';
  return 'C';
}

const GRADE_CONFIG = {
  A: { color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-300', desc: 'Elite performance' },
  B: { color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-300', desc: 'Solid — meets all expectations' },
  C: { color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300', desc: 'Minimum acceptable — needs improvement' },
  D: { color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300', desc: 'Underperforming — coaching required' },
  F: { color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', desc: 'Intervention required' },
};

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

function PassFailRow({ label, passed }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium">{label}</td>
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

// ── Main Scorecard ─────────────────────────────────────────────────────────────

export default function CSScorecard({ rcData, daysWorked }) {
  if (!rcData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No RingCentral data available for this week.</p>
        <p className="text-sm text-gray-400 mt-1">Upload a CSV to see the performance scorecard.</p>
      </div>
    );
  }

  const talkTimeHours = (rcData.talk_time_minutes || 0) / 60;
  const loggedInHours = (rcData.logged_in_minutes || 0) / 60;
  const availableHours = (rcData.available_minutes || 0) / 60;
  const offlineHours = (rcData.offline_minutes || 0) / 60;
  const effectiveDays = daysWorked || 5;
  const avgCallsPerDay = effectiveDays > 0 ? (rcData.total_calls / effectiveDays).toFixed(1) : 0;
  const utilization = loggedInHours > 0 ? ((talkTimeHours / loggedInHours) * 100).toFixed(1) : 0;

  // Proactivity checks
  const daily = rcData.daily_breakdown || [];
  const hasZeroCallDays = daily.some((d) => (d.total_calls || 0) === 0);
  const outboundEveryDay = daily.length > 0 && daily.every((d) => (d.outbound_calls || 0) > 0);

  const grade = calculateGrade(rcData.outbound_calls, parseFloat(utilization), hasZeroCallDays);
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
            <MetricRow label="Total Calls" target="≥ 75" actual={rcData.total_calls} />
            <MetricRow label="Inbound Calls" target="Track only" actual={rcData.inbound_calls} />
            <MetricRow label="Outbound Calls" target="≥ 40" actual={rcData.outbound_calls} />
            <MetricRow label="Avg Calls/Day" target="≥ 15" actual={avgCallsPerDay} />
            <MetricRow label="Talk Time" target="≥ 8" actual={talkTimeHours.toFixed(1)} unit="h" />
            <MetricRow label="Avg Handle Time" target="5–8" actual={(rcData.avg_handle_time_minutes || 0).toFixed(1)} unit=" min" />
          </tbody>
        </table>
      </div>

      {/* Section B: Availability & Utilization */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Section B — Availability & Utilization</h4>
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
            <MetricRow label="Logged-In Time" target="40" actual={loggedInHours.toFixed(1)} unit="h" />
            <MetricRow label="Available Time" target="≥ 30" actual={availableHours.toFixed(1)} unit="h" />
            <MetricRow label="Offline Time" target="< 3" actual={offlineHours.toFixed(1)} unit="h" inverse />
            <MetricRow label="Utilization %" target="≥ 20" actual={utilization} unit="%" />
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
            <PassFailRow label="Outbound Every Day" passed={outboundEveryDay} />
            <PassFailRow label="No 0-Call Days" passed={!hasZeroCallDays} />
            <PassFailRow label="Queue Participation" passed={availableHours >= 20} />
          </tbody>
        </table>
      </div>

      {/* Outbound Call Expectations */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Outbound Call Expectations</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 uppercase font-medium">Baseline (Conservative)</p>
            <p className="text-lg font-bold text-gray-900 mt-1">8/day &middot; 40/week</p>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-500 uppercase font-medium">Growth Agency</p>
            <p className="text-lg font-bold text-blue-900 mt-1">12/day &middot; 60/week</p>
          </div>
        </div>
      </div>
    </div>
  );
}
