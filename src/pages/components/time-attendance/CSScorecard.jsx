// src/pages/components/time-attendance/CSScorecard.jsx
// CS Performance Dashboard — Sections A (Activity), B (Efficiency & Quality),
// C (Proactivity) + A-F weekly grade.
//
// Redesigned: Section B uses answer rate, speed of answer, handle time, hold time,
// transfer rate, and missed call rate — all available from RC User Performance export.
// Grading model uses outbound calls + answer rate + handle time (no utilization).

import { useState } from 'react';
import { TrendingUp, TrendingDown, Phone, Clock, Activity, Award, CheckCircle, XCircle, Edit3 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';

// ── Grading Logic ──────────────────────────────────────────────────────────────
// Grade axes: outbound calls, answer rate, avg handle time
// 1. Outbound determines the base grade
// 2. Answer rate can downgrade by one letter
// 3. Handle time outside 4-10 min can downgrade by one letter
// 4. 0-call days on working days caps at D maximum
// 5. Final grade = lowest of the three axes

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

function downgrade(grade) {
  const idx = GRADE_ORDER.indexOf(grade);
  if (idx < 0 || idx >= GRADE_ORDER.length - 1) return grade;
  return GRADE_ORDER[idx + 1];
}

function calculateGrade(outboundCalls, answerRate, avgHandleTime, hasZeroCallDays) {
  // Base grade from outbound calls
  let grade;
  if (outboundCalls < 15) grade = 'F';
  else if (outboundCalls < 30) grade = 'D';
  else if (outboundCalls < 40) grade = 'C';
  else if (outboundCalls < 60) grade = 'B';
  else grade = 'A';

  // Answer rate adjustment
  const answerThresholds = { A: 98, B: 95, C: 90, D: 0, F: 0 };
  const requiredRate = answerThresholds[grade] || 0;
  if (answerRate < requiredRate) {
    grade = downgrade(grade);
  }

  // Handle time adjustment (optimal: 5-8 min, acceptable: 4-10 min)
  if (avgHandleTime > 0 && (avgHandleTime < 4 || avgHandleTime > 10)) {
    grade = downgrade(grade);
  }

  // 0-call days cap at D maximum
  if (hasZeroCallDays && GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf('D')) {
    grade = 'D';
  }

  return grade;
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

export default function CSScorecard({ rcData, daysWorked, proactivityData, orgId, weekStart, onProactivityUpdated }) {
  const [savingProactivity, setSavingProactivity] = useState(false);

  if (!rcData) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <Activity className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No RingCentral data available for this week.</p>
        <p className="text-sm text-gray-400 mt-1">Upload an XLSX to see the performance scorecard.</p>
      </div>
    );
  }

  const effectiveDays = daysWorked || 5;
  const avgCallsPerDay = rcData.avg_calls_per_day || (effectiveDays > 0 ? (rcData.total_calls / effectiveDays).toFixed(1) : 0);

  // Efficiency & Quality metrics
  const answerRate = rcData.inbound_calls > 0
    ? ((rcData.answered_calls / rcData.inbound_calls) * 100).toFixed(1)
    : '100.0';
  const avgSpeedOfAnswerSec = rcData.avg_speed_of_answer_seconds || 0;
  const avgHandleTime = rcData.avg_handle_time_minutes || 0;
  const avgHoldTime = rcData.avg_hold_time_minutes || 0;
  const transferRate = rcData.transfer_pct || (rcData.answered_calls > 0
    ? ((rcData.transfers / rcData.answered_calls) * 100).toFixed(1)
    : '0.0');
  const missedRate = rcData.missed_pct || (rcData.inbound_calls > 0
    ? ((rcData.missed_calls / rcData.inbound_calls) * 100).toFixed(1)
    : '0.0');
  const totalHandleTimeHours = (rcData.total_handle_time_minutes || 0) / 60;

  // Proactivity checks (auto-computed)
  const daily = rcData.daily_breakdown || [];
  const hasZeroCallDays = daily.some((d) => (d.total_calls || 0) === 0);
  const outboundEveryDay = daily.length > 0 && daily.every((d) => (d.outbound_calls || 0) > 0);

  // Manual proactivity flags
  const followUpNotesLogged = proactivityData?.follow_up_notes_logged || false;
  const queueParticipation = proactivityData?.queue_participation || false;

  const grade = calculateGrade(rcData.outbound_calls, parseFloat(answerRate), avgHandleTime, hasZeroCallDays);
  const gradeConfig = GRADE_CONFIG[grade];

  async function toggleProactivity(field) {
    if (savingProactivity) return;
    setSavingProactivity(true);

    const { data: { user } } = await supabase.auth.getUser();
    const newValue = !(proactivityData?.[field] || false);

    await supabase.from('cs_proactivity_manual').upsert({
      org_id: orgId,
      employee_user_id: rcData.employee_user_id,
      week_start: weekStart,
      [field]: newValue,
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'employee_user_id,week_start',
    });

    setSavingProactivity(false);
    if (onProactivityUpdated) onProactivityUpdated();
  }

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
            <MetricRow label="Answered Calls" target="Track only" actual={rcData.answered_calls} />
            <MetricRow label="Avg Handle Time" target="5–8" actual={avgHandleTime.toFixed(1)} unit=" min" />
            <MetricRow label="Total Handle Time" target="Track only" actual={totalHandleTimeHours.toFixed(1)} unit="h" />
          </tbody>
        </table>
      </div>

      {/* Section B: Efficiency & Quality */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
          <Clock className="w-5 h-5 text-blue-600" />
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
            <MetricRow label="Answer Rate" target="≥ 95" actual={answerRate} unit="%" />
            <MetricRow label="Avg Speed of Answer" target="< 20" actual={avgSpeedOfAnswerSec.toFixed(0)} unit="s" />
            <MetricRow label="Avg Handle Time" target="5–8" actual={avgHandleTime.toFixed(1)} unit=" min" />
            <MetricRow label="Avg Hold Time" target="< 2" actual={avgHoldTime.toFixed(1)} unit=" min" />
            <MetricRow label="Transfer Rate" target="< 15" actual={typeof transferRate === 'number' ? transferRate.toFixed(1) : transferRate} unit="%" />
            <MetricRow label="Missed Call Rate" target="< 5" actual={typeof missedRate === 'number' ? missedRate.toFixed(1) : missedRate} unit="%" />
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
            <PassFailRow
              label="Follow-Up Notes Logged"
              passed={followUpNotesLogged}
              manual
              onToggle={() => toggleProactivity('follow_up_notes_logged')}
            />
            <PassFailRow
              label="Queue Participation"
              passed={queueParticipation}
              manual
              onToggle={() => toggleProactivity('queue_participation')}
            />
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
