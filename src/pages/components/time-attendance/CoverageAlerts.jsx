// src/pages/components/time-attendance/CoverageAlerts.jsx
// Compares Call Log data and Queue data for the same date range and generates alerts.
// Renders as a card stack above the scorecard when alerts are present.
//
// Alert lifecycle:
//   status    — "active" (condition present in current window) or "resolved" (historical)
//   dedupeKey — stable identity for each alert instance (type + date + qualifier)
//   detectedAt — ISO timestamp when the alert was first generated in this render cycle
//
// Alerts are ephemeral (computed per render, not persisted). A resurfaced condition
// produces a fresh alert instance with a new detectedAt but the same dedupeKey,
// so operators can correlate across weeks.

import { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────────

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

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function cleanQueueName(name) {
  if (!name) return name;
  return name.replace(/^\w+\s+/, '');
}

function isDateInPast(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

// ── Alert Detection ─────────────────────────────────────────────────────────────

function detectCoverageGap(queueData, callLogData, date) {
  const dateQueues = queueData.filter((q) => q.report_date === date);
  const queueInbound = dateQueues.reduce((sum, q) => sum + q.inbound, 0);

  const agentInboundCalls = callLogData.filter(
    (c) => c.call_date === date && c.call_direction === 'Inbound'
  );
  const agentInbound = agentInboundCalls.length;

  const queueAbandoned = dateQueues.reduce((sum, q) => sum + q.abandoned, 0);

  if (queueInbound > 0 && agentInbound === 0) {
    return {
      severity: 'critical',
      title: 'No Agent Coverage',
      message: `${queueInbound} calls entered queues on ${formatDate(date)} but no agent answered any calls. ${queueAbandoned} calls abandoned. Check if agents were logged into the phone system.`,
      date,
      dedupeKey: `coverage-gap:${date}`,
      status: isDateInPast(date) ? 'resolved' : 'active',
      detectedAt: new Date().toISOString(),
      context: {
        queueInbound,
        agentInbound,
        abandoned: queueAbandoned,
        queueCount: dateQueues.length,
        windowLabel: '1 day',
      },
    };
  }
  return null;
}

function detectHighAbandon(queueData, date) {
  const alerts = [];
  const dateQueues = queueData.filter((q) => q.report_date === date && q.inbound > 0);

  for (const q of dateQueues) {
    if (q.abandon_rate > 25 && q.answered > 0) {
      alerts.push({
        severity: 'warning',
        title: `High Abandon Rate \u2014 ${cleanQueueName(q.queue_name)}`,
        message: `${q.abandoned} of ${q.inbound} calls abandoned (${Number(q.abandon_rate).toFixed(0)}%) in ${cleanQueueName(q.queue_name)} on ${formatDate(date)}. Check staffing levels.`,
        date,
        dedupeKey: `high-abandon:${date}:${q.queue_name}`,
        status: isDateInPast(date) ? 'resolved' : 'active',
        detectedAt: new Date().toISOString(),
        context: {
          threshold: '25%',
          observed: `${Number(q.abandon_rate).toFixed(1)}%`,
          sampleSize: q.inbound,
          answered: q.answered,
          abandoned: q.abandoned,
          windowLabel: '1 day',
          queue: q.queue_name,
        },
      });
    }
  }
  return alerts;
}

function detectDataMismatch(queueData, callLogData, date) {
  const dateQueues = queueData.filter((q) => q.report_date === date);
  const queueAnswered = dateQueues.reduce((sum, q) => sum + q.answered, 0);

  const agentAnsweredCalls = callLogData.filter(
    (c) => c.call_date === date && c.call_direction === 'Inbound' && c.call_result === 'Answered'
  );
  const agentAnswered = agentAnsweredCalls.length;

  const diff = Math.abs(queueAnswered - agentAnswered);
  if (diff > 2) {
    return {
      severity: 'info',
      title: 'Data Mismatch',
      message: `Queue report shows ${queueAnswered} answered calls but Call Log shows ${agentAnswered} for ${formatDate(date)}. Difference of ${diff} \u2014 may be due to report timing or filters.`,
      date,
      dedupeKey: `data-mismatch:${date}`,
      status: isDateInPast(date) ? 'resolved' : 'active',
      detectedAt: new Date().toISOString(),
      context: {
        queueAnswered,
        agentAnswered,
        difference: diff,
        queueSources: dateQueues.length,
        callLogRecords: agentAnsweredCalls.length,
        windowLabel: '1 day',
      },
    };
  }
  return null;
}

function detectZeroOutbound(callLogData, date, employeeId) {
  const agentCalls = callLogData.filter(
    (c) => c.call_date === date && c.employee_user_id === employeeId
  );
  const inboundCalls = agentCalls.filter((c) => c.call_direction === 'Inbound');
  const outboundCalls = agentCalls.filter((c) => c.call_direction === 'Outbound');

  if (inboundCalls.length > 0 && outboundCalls.length === 0) {
    return {
      severity: 'warning',
      title: 'Zero Outbound Activity',
      message: `Agent had ${inboundCalls.length} inbound call(s) on ${formatDate(date)} but made zero outbound calls.`,
      date,
      dedupeKey: `zero-outbound:${date}:${employeeId}`,
      status: isDateInPast(date) ? 'resolved' : 'active',
      detectedAt: new Date().toISOString(),
      context: {
        inboundCount: inboundCalls.length,
        outboundCount: 0,
        totalAgentCalls: agentCalls.length,
        windowLabel: '1 day',
      },
    };
  }
  return null;
}

// ── New Failure Code Detection ──────────────────────────────────────────────────
// Novelty semantics:
//   lookback  — codes seen in the prior 4 weeks of call log data define the "known" set
//   minCount  — a new code must appear >= 3 times in the current window to trigger
//   newWindow — a code is treated as "new" only within its first observed week

const NEW_CODE_LOOKBACK_WEEKS = 4;
const NEW_CODE_MIN_COUNT = 3;

function detectNewFailureCodes(callLogData, weekStart, priorCallLogData) {
  // Build known result codes from prior weeks
  const knownCodes = new Set();
  if (priorCallLogData && priorCallLogData.length > 0) {
    for (const c of priorCallLogData) {
      if (c.call_result) knownCodes.add(c.call_result);
    }
  }

  // Count result codes in current week
  const currentCounts = {};
  const currentWeekCalls = callLogData.filter((c) => {
    if (!c.call_date) return false;
    return c.call_date >= weekStart;
  });

  for (const c of currentWeekCalls) {
    if (!c.call_result) continue;
    currentCounts[c.call_result] = (currentCounts[c.call_result] || 0) + 1;
  }

  const alerts = [];
  for (const [code, count] of Object.entries(currentCounts)) {
    if (!knownCodes.has(code) && count >= NEW_CODE_MIN_COUNT) {
      alerts.push({
        severity: 'info',
        title: `New Call Result Code: "${code}"`,
        message: `"${code}" appeared ${count} time(s) this week and was not seen in the prior ${NEW_CODE_LOOKBACK_WEEKS} weeks. Review whether this indicates a new failure pattern.`,
        date: weekStart,
        dedupeKey: `new-code:${weekStart}:${code}`,
        status: 'active',
        detectedAt: new Date().toISOString(),
        context: {
          code,
          currentCount: count,
          lookbackWeeks: NEW_CODE_LOOKBACK_WEEKS,
          minCountThreshold: NEW_CODE_MIN_COUNT,
          knownCodesCount: knownCodes.size,
          currentWeekCalls: currentWeekCalls.length,
          windowLabel: `1 week (lookback: ${NEW_CODE_LOOKBACK_WEEKS} weeks)`,
        },
      });
    }
  }
  return alerts;
}

// ── Main Alert Runner ───────────────────────────────────────────────────────────

export function generateAlerts(queueData, callLogData, weekStart, employeeId, priorCallLogData) {
  const alerts = [];
  const workdays = getWorkdaysInRange(weekStart, 5);

  for (const date of workdays) {
    // Coverage gap (queue vs call log)
    if (queueData.length > 0) {
      const gap = detectCoverageGap(queueData, callLogData, date);
      if (gap) alerts.push(gap);

      // High abandon (queue only)
      const abandons = detectHighAbandon(queueData, date);
      alerts.push(...abandons);

      // Data mismatch (queue vs call log)
      const mismatch = detectDataMismatch(queueData, callLogData, date);
      if (mismatch) alerts.push(mismatch);
    }

    // Zero outbound (call log only, per-agent)
    if (employeeId && employeeId !== 'all') {
      const zeroOut = detectZeroOutbound(callLogData, date, employeeId);
      if (zeroOut) alerts.push(zeroOut);
    }
  }

  // New failure code detection (week-level)
  const newCodes = detectNewFailureCodes(callLogData, weekStart, priorCallLogData);
  alerts.push(...newCodes);

  // Sort: critical first, then warning, then info; active before resolved within same severity
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  const statusOrder = { active: 0, resolved: 1 };
  alerts.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
  });

  return alerts;
}

// ── Severity Styling ────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertCircle,
    bg: 'bg-red-50',
    border: 'border-l-4 border-red-500',
    text: 'text-red-800',
    iconColor: 'text-red-600',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-amber-50',
    border: 'border-l-4 border-amber-500',
    text: 'text-amber-800',
    iconColor: 'text-amber-600',
  },
  info: {
    icon: Info,
    bg: 'bg-blue-50',
    border: 'border-l-4 border-blue-500',
    text: 'text-blue-800',
    iconColor: 'text-blue-600',
  },
};

// ── Alert Detail Drilldown ──────────────────────────────────────────────────────

function AlertContext({ context }) {
  if (!context) return null;

  const entries = Object.entries(context).filter(
    ([key]) => key !== 'windowLabel'
  );
  if (entries.length === 0) return null;

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
        {context.currentWeekCalls != null && (
          <span className="text-xs text-gray-500">
            Current week calls: {context.currentWeekCalls}
          </span>
        )}
        {context.lookbackWeeks != null && (
          <span className="text-xs text-gray-500">
            Lookback: {context.lookbackWeeks} weeks
          </span>
        )}
        {context.minCountThreshold != null && (
          <span className="text-xs text-gray-500">
            Min count: {context.minCountThreshold}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function CoverageAlerts({ queueData = [], callLogData = [], weekStart, employeeId, priorCallLogData = [] }) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const alerts = generateAlerts(queueData, callLogData, weekStart, employeeId, priorCallLogData);

  if (alerts.length === 0) return null;

  const activeCount = alerts.filter((a) => a.status === 'active').length;
  const resolvedCount = alerts.filter((a) => a.status === 'resolved').length;

  return (
    <div className="space-y-2">
      {/* Summary banner — counts only, no action implication */}
      <div className="flex items-center gap-3 text-xs text-gray-500 px-1">
        <span>{alerts.length} alert{alerts.length !== 1 ? 's' : ''}</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
            {activeCount} active
          </span>
        )}
        {resolvedCount > 0 && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
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
            className={`rounded-lg ${config.bg} ${config.border} ${isResolved ? 'opacity-70' : ''}`}
          >
            <button
              type="button"
              className="flex gap-3 p-4 w-full text-left"
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
            >
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-semibold ${config.text}`}>
                    {alert.title} {alert.date && `\u2014 ${formatDate(alert.date)}`}
                  </p>
                  {isResolved && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 font-medium flex-shrink-0">
                      resolved
                    </span>
                  )}
                </div>
                <p className={`text-sm ${config.text} mt-0.5`}>{alert.message}</p>
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
