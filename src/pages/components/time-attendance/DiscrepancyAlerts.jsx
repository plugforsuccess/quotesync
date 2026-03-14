// src/pages/components/time-attendance/DiscrepancyAlerts.jsx
// Cross-check alerts between time entries and RingCentral data.
//
// Revised: Uses total handle time and answer rate as proxy indicators
// for desk presence and engagement (RC does not export logged-in time).
//
// Alert lifecycle:
//   status    — "active" (current week, condition present) or "resolved" (past week / condition cleared)
//   dedupeKey — stable identity: type + weekStart + employeeId
//   detectedAt — ISO timestamp for this render cycle
//
// Each alert includes a `context` object with baseline/threshold details so operators
// can see the denominator (sample counts, window sizes) behind rate-based alerts.

import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

const SEVERITY_CONFIG = {
  red: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
  yellow: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', iconColor: 'text-yellow-600' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-600' },
};

function isCurrentWeek(weekStart) {
  const now = new Date();
  const ws = new Date(weekStart + 'T00:00:00');
  const weekEnd = new Date(ws);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return now >= ws && now <= weekEnd;
}

function checkDiscrepancies(timeEntries, rcData, weekStart, roleType) {
  const alerts = [];

  if (!timeEntries || timeEntries.length === 0) return alerts;
  if (!rcData) return alerts;

  const currentWeek = isCurrentWeek(weekStart);
  const employeeId = rcData.employee_user_id || 'unknown';
  const regOrWfhDays = timeEntries.filter((e) => ['REG', 'WFH'].includes(e.code));

  // ── Producer-specific checks (outbound effort only) ───────────────────
  if (roleType === 'producer') {
    if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
      alerts.push({
        severity: 'yellow',
        title: 'Zero Outbound Calls',
        detail: `${regOrWfhDays.length} working day(s) logged, but 0 outbound calls recorded in RingCentral.`,
        meaning: 'Producer should be making prospecting calls on working days.',
        dedupeKey: `zero-outbound-producer:${weekStart}:${employeeId}`,
        status: currentWeek ? 'active' : 'resolved',
        detectedAt: new Date().toISOString(),
        context: {
          daysWorked: regOrWfhDays.length,
          outboundCalls: 0,
          windowLabel: '1 week',
        },
      });
    }
    return alerts;
  }

  // ── Service rep checks (all 6 discrepancy checks) ─────────────────────────

  const totalHoursLogged = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
  const totalHandleTimeHours = (rcData.total_handle_time_minutes || 0) / 60;
  const answerRate = rcData.inbound_calls > 0
    ? (rcData.answered_calls / rcData.inbound_calls) * 100
    : 100;
  const avgHoldTime = rcData.avg_hold_time_minutes || 0;

  // Check 1: Time log says 8+ hrs but RC total handle time < 1 hr
  if (totalHoursLogged >= 8 && totalHandleTimeHours < 1) {
    alerts.push({
      severity: 'red',
      title: 'Hours Mismatch',
      detail: `Time log shows ${totalHoursLogged.toFixed(1)}h total, but RC total handle time is only ${totalHandleTimeHours.toFixed(1)}h.`,
      meaning: 'Employee logged a full day but had minimal phone activity.',
      dedupeKey: `hours-mismatch:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        hoursLogged: `${totalHoursLogged.toFixed(1)}h`,
        handleTime: `${totalHandleTimeHours.toFixed(1)}h`,
        threshold: 'Logged >= 8h, Handle < 1h',
        timeEntryCount: timeEntries.length,
        windowLabel: '1 week',
      },
    });
  }

  // Check 2: Time log says OFFICE but RC shows 0 total calls
  const officeDays = timeEntries.filter((e) => e.location === 'OFFICE' && ['REG', 'WFH'].includes(e.code));
  if (officeDays.length > 0 && (rcData.total_calls || 0) === 0) {
    alerts.push({
      severity: 'red',
      title: 'Office But No Calls',
      detail: `${officeDays.length} office day(s) logged, but RingCentral shows 0 total calls for the week.`,
      meaning: 'Possible missed login or location discrepancy.',
      dedupeKey: `office-no-calls:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        officeDays: officeDays.length,
        totalCalls: rcData.total_calls || 0,
        windowLabel: '1 week',
      },
    });
  }

  // Check 3: RC shows 0 outbound on a REG/WFH day
  if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
    alerts.push({
      severity: 'yellow',
      title: 'Zero Outbound Calls',
      detail: `${regOrWfhDays.length} working day(s) logged, but 0 outbound calls recorded in RingCentral.`,
      meaning: 'Zero proactivity on standard working days.',
      dedupeKey: `zero-outbound:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        daysWorked: regOrWfhDays.length,
        outboundCalls: 0,
        windowLabel: '1 week',
      },
    });
  }

  // Check 4: Answer rate < 80% for the week
  if (rcData.inbound_calls > 0 && answerRate < 80) {
    alerts.push({
      severity: 'yellow',
      title: 'Low Answer Rate',
      detail: `Answer rate is ${answerRate.toFixed(1)}% (${rcData.answered_calls} answered / ${rcData.inbound_calls} inbound).`,
      meaning: 'Excessive missed inbound calls — may indicate away from desk.',
      dedupeKey: `low-answer-rate:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        observed: `${answerRate.toFixed(1)}%`,
        threshold: '80%',
        answered: rcData.answered_calls,
        inbound: rcData.inbound_calls,
        sampleSize: rcData.inbound_calls,
        windowLabel: '1 week',
      },
    });
  }

  // Check 5: Avg hold time > 5 min
  if (avgHoldTime > 5) {
    alerts.push({
      severity: 'yellow',
      title: 'High Hold Time',
      detail: `Average hold time is ${avgHoldTime.toFixed(1)} min (target: < 2 min).`,
      meaning: 'Callers being parked too long — quality concern.',
      dedupeKey: `high-hold-time:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        observed: `${avgHoldTime.toFixed(1)} min`,
        threshold: '5 min (target: 2 min)',
        totalCalls: rcData.total_calls || 0,
        windowLabel: '1 week',
      },
    });
  }

  // Check 6: Multiple SICK/EARLY days in this week (pattern flag)
  const sickEarlyDays = timeEntries.filter((e) => ['SICK', 'SICK_PART', 'EARLY'].includes(e.code));
  if (sickEarlyDays.length >= 3) {
    alerts.push({
      severity: 'info',
      title: 'Frequent Absences',
      detail: `${sickEarlyDays.length} sick/early entries in this week.`,
      meaning: 'Pattern may warrant a conversation.',
      dedupeKey: `frequent-absences:${weekStart}:${employeeId}`,
      status: currentWeek ? 'active' : 'resolved',
      detectedAt: new Date().toISOString(),
      context: {
        sickEarlyCount: sickEarlyDays.length,
        totalEntries: timeEntries.length,
        threshold: '3+ per week',
        windowLabel: '1 week',
      },
    });
  }

  return alerts;
}

// ── Alert Detail Drilldown ──────────────────────────────────────────────────────

function AlertContext({ context }) {
  if (!context) return null;

  return (
    <div className="mt-2 pt-2 border-t border-black/10">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {context.windowLabel && (
          <span className="text-xs text-gray-500">
            Window: {context.windowLabel}
          </span>
        )}
        {context.sampleSize != null && (
          <span className="text-xs text-gray-500">
            Sample: {context.sampleSize} calls
          </span>
        )}
        {context.threshold != null && (
          <span className="text-xs text-gray-500">
            Threshold: {context.threshold}
          </span>
        )}
        {context.observed != null && (
          <span className="text-xs text-gray-500">
            Observed: {context.observed}
          </span>
        )}
        {context.daysWorked != null && (
          <span className="text-xs text-gray-500">
            Days worked: {context.daysWorked}
          </span>
        )}
        {context.totalEntries != null && (
          <span className="text-xs text-gray-500">
            Time entries: {context.totalEntries}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DiscrepancyAlerts({ timeEntries, rcData, weekStart, roleType = 'service' }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  // Show informational banner when time entries exist but no RC data is available
  if ((!rcData || Object.keys(rcData).length === 0) && timeEntries && timeEntries.length > 0) {
    return (
      <div className="flex gap-3 p-4 rounded-lg border bg-gray-50 border-gray-200">
        <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-700">No RingCentral data for this week</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a RingCentral XLSX on the CS Performance tab to enable cross-check alerts.
          </p>
        </div>
      </div>
    );
  }

  const alerts = checkDiscrepancies(timeEntries, rcData, weekStart, roleType);

  if (alerts.length === 0) {
    return null;
  }

  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          Cross-Check Alerts ({alerts.length})
        </h4>
        {activeCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
            {activeCount} active
          </span>
        )}
        {resolvedCount > 0 && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
            {resolvedCount} resolved
          </span>
        )}
      </div>
      {alerts.map((alert, i) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;
        const isExpanded = expandedIndex === i;
        const isResolved = alert.status === 'resolved';

        return (
          <div
            key={alert.dedupeKey || i}
            className={`rounded-lg border ${config.bg} ${config.border} ${isResolved ? 'opacity-70' : ''}`}
          >
            <button
              type="button"
              className="flex gap-3 p-4 w-full text-left"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${config.text}`}>{alert.title}</p>
                  {isResolved && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium flex-shrink-0">
                      resolved
                    </span>
                  )}
                </div>
                <p className={`text-sm ${config.text} mt-0.5`}>{alert.detail}</p>
                <p className="text-xs text-gray-600 mt-1">{alert.meaning}</p>
              </div>
              <div className="flex-shrink-0 mt-0.5">
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </button>
            {isExpanded && (
              <div className="px-4 pb-4 pl-12">
                <AlertContext context={alert.context} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
