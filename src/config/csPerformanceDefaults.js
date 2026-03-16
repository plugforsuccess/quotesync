// Retention bonus structure — Nathan earns $25/save above 30 saves/month
// Verified against RingCentral call log (outbound connected call required)
export const RETENTION_BONUS_THRESHOLD = 30;
export const RETENTION_BONUS_PER_SAVE  = 25;

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
  B: { color: 'text-primary-700', bg: 'bg-primary-100', border: 'border-primary-300', desc: 'Solid — meets all expectations', numeric: 4 },
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
 * Calculate grade from call log metrics (primary) and optional summary data.
 *
 * Three-axis model: outbound volume (40%) + inbound answer rate (35%) + outbound consistency (25%).
 * Final grade = lowest axis.
 * Zero-call days force an F regardless of other metrics.
 *
 * Speed of Answer and Hold Time are NOT included in the grade formula.
 * They can be tracked via the optional weekly summary upload but do not affect the grade.
 *
 * Accepts either the new call-log-based metrics object or legacy positional args.
 */
export function calculateGrade(metricsOrOutbound, answerRateOrSummary, hasZeroCallDaysOrTargets, targetsArg) {
  // Support both new signature: calculateGrade(metrics, summaryData, targets)
  // and legacy signature: calculateGrade(outboundCalls, answerRate, hasZeroCallDays, targets)
  let outboundCalls, answerRate, hasZeroCallDays, zeroDays, outboundEveryDay, targets;

  if (typeof metricsOrOutbound === 'object' && metricsOrOutbound !== null && 'outboundAttempts' in metricsOrOutbound) {
    // New call-log-based signature
    const metrics = metricsOrOutbound;
    outboundCalls = metrics.outboundAttempts;
    answerRate = metrics.answerRate;
    hasZeroCallDays = metrics.hasZeroCallDays;
    zeroDays = metrics.zeroDays || [];
    outboundEveryDay = metrics.outboundEveryDay;
    targets = hasZeroCallDaysOrTargets;
  } else {
    // Legacy signature
    outboundCalls = metricsOrOutbound;
    answerRate = answerRateOrSummary;
    hasZeroCallDays = hasZeroCallDaysOrTargets;
    zeroDays = [];
    outboundEveryDay = true; // unknown in legacy mode
    targets = targetsArg;
  }

  // F override — zero-call days always fail regardless of other metrics
  if (hasZeroCallDays) return 'F';

  const t = { ...DEFAULT_TARGETS, ...targets };

  // Axis 1: Outbound volume (40%)
  let outGrade;
  if (outboundCalls >= t.grade_a_outbound) outGrade = 4;
  else if (outboundCalls >= t.grade_b_outbound) outGrade = 3;
  else if (outboundCalls >= t.grade_c_outbound) outGrade = 2;
  else outGrade = 1;

  // Axis 2: Inbound answer rate (35%) — skip if data unavailable
  let arGrade = 4; // default: don't penalize if no inbound data
  if (isFinite(answerRate)) {
    if (answerRate >= t.grade_a_answer_rate) arGrade = 4;
    else if (answerRate >= t.grade_b_answer_rate) arGrade = 3;
    else if (answerRate >= t.grade_c_answer_rate) arGrade = 2;
    else arGrade = 1;
  }

  // Axis 3: Outbound consistency (25%)
  const zeroDayCount = zeroDays.length || 0;
  let consistGrade;
  if (outboundEveryDay) consistGrade = 4;
  else if (zeroDayCount <= 1) consistGrade = 3;
  else if (zeroDayCount <= 2) consistGrade = 2;
  else consistGrade = 1;

  // Final grade = lowest axis
  const combined = Math.min(outGrade, arGrade, consistGrade);
  const map = { 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  return map[combined] || 'D';
}

/**
 * Compute derived metrics from raw RC summary data (legacy).
 */
export function computeMetrics(rcData, daysWorked) {
  const effectiveDays = daysWorked || 5;
  const totalCalls = rcData.total_calls || 0;
  const inboundCalls = rcData.inbound_calls || 0;
  const answeredCalls = rcData.answered_calls || 0;
  const missedCalls = rcData.missed_calls || 0;
  const transfers = rcData.transfers || 0;

  const answerRate = inboundCalls > 0 ? (answeredCalls / inboundCalls) * 100 : NaN;
  const missedCallRate = totalCalls > 0 ? (missedCalls / totalCalls) * 100 : 0;
  const transferRate = totalCalls > 0 ? (transfers / totalCalls) * 100 : 0;
  const avgCallsPerDay = effectiveDays > 0 ? totalCalls / effectiveDays : 0;

  const totalHandleTimeHours = (rcData.total_handle_time_minutes || 0) / 60;

  const daily = rcData.daily_breakdown || [];
  const hasZeroCallDays = daily.some((d) => (d.total_calls || 0) === 0);
  const outboundEveryDay = daily.length > 0 && daily.every((d) => (d.outbound_calls || 0) > 0);

  return {
    answerRate,
    missedCallRate,
    transferRate,
    avgCallsPerDay,
    totalHandleTimeHours,
    hasZeroCallDays,
    outboundEveryDay,
  };
}

// Business timezone for day boundary computation.
// All "call_date" values in the DB are already computed in this tz at ingest time.
const BUSINESS_TZ = 'America/New_York';

/**
 * Compute metrics from call log data (new primary source).
 * call_date values are assumed to already be in business tz (set at ingest).
 */
export function computeCallLogMetrics(calls, weekStart) {
  if (!calls || calls.length === 0) {
    return {
      totalCalls: 0,
      outboundAttempts: 0,
      outboundConnected: 0,
      outboundConnectRate: 0,
      inboundTotal: 0,
      inboundAnswered: 0,
      inboundMissed: 0,
      answerRate: NaN,
      salesCalls: 0,
      serviceCalls: 0,
      salesPct: 0,
      servicePct: 0,
      avgHandleTimeMin: 0,
      totalHandleTimeMin: 0,
      longestCall: null,
      hasLongCall: false,
      hasZeroCallDays: false,
      zeroDays: [],
      outboundEveryDay: true,
      daily: [],
      avgOutboundPerDay: 0,
      avgCallsPerDay: 0,
      daysWorked: 0,
    };
  }

  // ── Outbound metrics ──
  const outbound = calls.filter((c) => c.call_direction === 'Outbound');
  const outboundAttempts = outbound.length;
  const outboundConnected = outbound.filter((c) => c.call_result === 'Connected').length;
  const outboundConnectRate = outboundAttempts > 0
    ? (outboundConnected / outboundAttempts) * 100 : 0;

  // ── Inbound metrics ──
  const inbound = calls.filter((c) => c.call_direction === 'Inbound');
  const inboundAnswered = inbound.filter((c) => c.call_result === 'Answered').length;
  const inboundMissed = inbound.filter((c) => c.call_result === 'VM/Missed').length;
  const inboundTotal = inbound.length;
  const answerRate = inboundTotal > 0
    ? (inboundAnswered / inboundTotal) * 100 : NaN;

  // ── Queue split ──
  const salesCalls = inbound.filter((c) => c.queue_type === 'sales').length;
  const serviceCalls = inbound.filter((c) => c.queue_type === 'service').length;
  const salesPct = inboundTotal > 0 ? (salesCalls / inboundTotal) * 100 : 0;
  const servicePct = inboundTotal > 0 ? (serviceCalls / inboundTotal) * 100 : 0;

  // ── Handle time ──
  const callsWithHandle = calls.filter((c) => c.handle_time_seconds > 0);
  const avgHandleTimeSec = callsWithHandle.length > 0
    ? callsWithHandle.reduce((sum, c) => sum + c.handle_time_seconds, 0) / callsWithHandle.length
    : 0;
  const avgHandleTimeMin = avgHandleTimeSec / 60;
  const totalHandleTimeMin = callsWithHandle.reduce((sum, c) => sum + c.handle_time_seconds, 0) / 60;

  // ── Longest call flag ──
  const longestCall = calls.reduce((max, c) =>
    c.call_length_seconds > (max?.call_length_seconds || 0) ? c : max, null);
  const hasLongCall = longestCall && longestCall.call_length_seconds > 1800;

  // ── Daily breakdown ──
  const dailyMap = {};
  for (const call of calls) {
    if (!dailyMap[call.call_date]) {
      dailyMap[call.call_date] = {
        date: call.call_date,
        outbound: 0,
        inbound: 0,
        answered: 0,
        missed: 0,
        total: 0,
        handle_seconds: 0,
        handle_count: 0,
        first_call_time: call.call_start_time,
        last_call_time: call.call_start_time,
      };
    }
    const day = dailyMap[call.call_date];
    day.total++;
    if (call.call_direction === 'Outbound') day.outbound++;
    if (call.call_direction === 'Inbound') day.inbound++;
    if (call.call_result === 'Answered') day.answered++;
    if (call.call_result === 'VM/Missed') day.missed++;
    if (call.handle_time_seconds > 0) {
      day.handle_seconds += call.handle_time_seconds;
      day.handle_count++;
    }
    if (call.call_start_time < day.first_call_time) day.first_call_time = call.call_start_time;
    if (call.call_start_time > day.last_call_time) day.last_call_time = call.call_start_time;
  }
  const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

  // ── Zero-call days and outbound consistency ──
  const workdays = getWorkdaysInRange(weekStart, 5);
  const daysWithCalls = new Set(calls.map((c) => c.call_date));
  const zeroDays = workdays.filter((d) => !daysWithCalls.has(d));
  const hasZeroCallDays = zeroDays.length > 0;

  const daysWithOutbound = new Set(outbound.map((c) => c.call_date));
  const outboundEveryDay = workdays.every((d) => daysWithOutbound.has(d));

  // ── Per-day averages ──
  const daysWorked = workdays.filter((d) => daysWithCalls.has(d)).length || 1;
  const avgOutboundPerDay = outboundAttempts / daysWorked;
  const avgCallsPerDay = calls.length / daysWorked;

  return {
    totalCalls: calls.length,
    outboundAttempts,
    outboundConnected,
    outboundConnectRate,
    inboundTotal,
    inboundAnswered,
    inboundMissed,
    answerRate,
    salesCalls,
    serviceCalls,
    salesPct,
    servicePct,
    avgHandleTimeMin,
    totalHandleTimeMin,
    longestCall,
    hasLongCall,
    hasZeroCallDays,
    zeroDays,
    outboundEveryDay,
    daily,
    avgOutboundPerDay,
    avgCallsPerDay,
    daysWorked,
  };
}

/**
 * Get array of workday date strings (Mon-Fri) starting from weekStart.
 */
function getWorkdaysInRange(weekStart, count) {
  const days = [];
  const start = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}
