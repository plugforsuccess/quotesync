// Default targets for CS Performance scoring.
// Used as fallback when no per-employee cs_performance_targets row exists.

export const DEFAULT_TARGETS = {
  // Activity targets
  outbound_calls_weekly: 40,
  total_calls_weekly: 75,
  avg_handle_time_min_low: 5.0,
  avg_handle_time_min_high: 8.0,
  avg_calls_per_day: 15,

  // Efficiency & Quality targets
  answer_rate_pct: 95.0,
  avg_speed_of_answer_sec: 20,
  avg_hold_time_min: 2.0,
  transfer_rate_pct: 15.0,
  missed_call_rate_pct: 5.0,

  // Grade thresholds (outbound)
  grade_a_outbound: 60,
  grade_b_outbound: 40,
  grade_c_outbound: 30,

  // Grade thresholds (answer rate)
  grade_a_answer_rate: 98.0,
  grade_b_answer_rate: 95.0,
  grade_c_answer_rate: 90.0,
};

export const GRADE_CONFIG = {
  A: { color: 'text-green-700', bg: 'bg-green-100', border: 'border-green-300', desc: 'Elite performance', numeric: 5 },
  B: { color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-300', desc: 'Solid — meets all expectations', numeric: 4 },
  C: { color: 'text-yellow-700', bg: 'bg-yellow-100', border: 'border-yellow-300', desc: 'Minimum acceptable — needs improvement', numeric: 3 },
  D: { color: 'text-orange-700', bg: 'bg-orange-100', border: 'border-orange-300', desc: 'Underperforming — coaching required', numeric: 2 },
  F: { color: 'text-red-700', bg: 'bg-red-100', border: 'border-red-300', desc: 'Intervention required', numeric: 1 },
};

export const OUTBOUND_CATEGORIES = [
  { key: 'renewal', label: 'Renewal Review', color: '#3b82f6' },
  { key: 'cross_sell', label: 'Cross-Sell', color: '#8b5cf6' },
  { key: 'billing', label: 'Billing Follow-Up', color: '#f59e0b' },
  { key: 'save_attempt', label: 'Save Attempt', color: '#10b981' },
  { key: 'winback', label: 'Winback', color: '#ef4444' },
  { key: 'other', label: 'Other', color: '#6b7280' },
];

/**
 * Calculate grade from outbound calls and answer rate against targets.
 */
export function calculateGrade(outboundCalls, answerRate, hasZeroCallDays, targets) {
  const t = { ...DEFAULT_TARGETS, ...targets };

  // Outbound-based grade
  let outGrade;
  if (outboundCalls >= t.grade_a_outbound) outGrade = 4;
  else if (outboundCalls >= t.grade_b_outbound) outGrade = 3;
  else if (outboundCalls >= t.grade_c_outbound) outGrade = 2;
  else outGrade = 1;

  // Answer-rate-based grade
  let arGrade;
  if (answerRate >= t.grade_a_answer_rate) arGrade = 4;
  else if (answerRate >= t.grade_b_answer_rate) arGrade = 3;
  else if (answerRate >= t.grade_c_answer_rate) arGrade = 2;
  else arGrade = 1;

  // Take the lower of the two
  const combined = Math.min(outGrade, arGrade);

  // F override for zero-call days
  if (hasZeroCallDays) return 'F';

  const map = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  return map[combined] || 'D';
}

/**
 * Compute derived metrics from raw RC data.
 */
export function computeMetrics(rcData, daysWorked) {
  const effectiveDays = daysWorked || 5;
  const totalCalls = rcData.total_calls || 0;
  const answeredCalls = rcData.answered_calls || 0;
  const missedCalls = rcData.missed_calls || 0;
  const transfers = rcData.transfers || 0;

  const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;
  const missedCallRate = totalCalls > 0 ? (missedCalls / totalCalls) * 100 : 0;
  const transferRate = totalCalls > 0 ? (transfers / totalCalls) * 100 : 0;
  const avgCallsPerDay = effectiveDays > 0 ? totalCalls / effectiveDays : 0;

  const talkTimeHours = (rcData.talk_time_minutes || 0) / 60;
  const loggedInHours = (rcData.logged_in_minutes || 0) / 60;
  const availableHours = (rcData.available_minutes || 0) / 60;
  const offlineHours = (rcData.offline_minutes || 0) / 60;

  const daily = rcData.daily_breakdown || [];
  const hasZeroCallDays = daily.some((d) => (d.total_calls || 0) === 0);
  const outboundEveryDay = daily.length > 0 && daily.every((d) => (d.outbound_calls || 0) > 0);

  return {
    answerRate,
    missedCallRate,
    transferRate,
    avgCallsPerDay,
    talkTimeHours,
    loggedInHours,
    availableHours,
    offlineHours,
    hasZeroCallDays,
    outboundEveryDay,
  };
}
