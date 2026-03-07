// src/pages/components/time-attendance/CoverageAlerts.jsx
// Compares Call Log data and Queue data for the same date range and generates alerts.
// Renders as a card stack above the scorecard when alerts are present.

import { AlertCircle, AlertTriangle, Info } from 'lucide-react';

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

// ── Alert Detection ─────────────────────────────────────────────────────────────

function detectCoverageGap(queueData, callLogData, date) {
  const queueInbound = queueData
    .filter((q) => q.report_date === date)
    .reduce((sum, q) => sum + q.inbound, 0);

  const agentInbound = callLogData
    .filter((c) => c.call_date === date && c.call_direction === 'Inbound')
    .length;

  const queueAbandoned = queueData
    .filter((q) => q.report_date === date)
    .reduce((sum, q) => sum + q.abandoned, 0);

  if (queueInbound > 0 && agentInbound === 0) {
    return {
      severity: 'critical',
      title: 'No Agent Coverage',
      message: `${queueInbound} calls entered queues on ${formatDate(date)} but no agent answered any calls. ${queueAbandoned} calls abandoned. Check if agents were logged into the phone system.`,
      date,
      queueInbound,
      agentInbound,
      abandoned: queueAbandoned,
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
        queue: q.queue_name,
        abandonRate: q.abandon_rate,
      });
    }
  }
  return alerts;
}

function detectDataMismatch(queueData, callLogData, date) {
  const queueAnswered = queueData
    .filter((q) => q.report_date === date)
    .reduce((sum, q) => sum + q.answered, 0);

  const agentAnswered = callLogData
    .filter((c) => c.call_date === date && c.call_direction === 'Inbound' && c.call_result === 'Answered')
    .length;

  const diff = Math.abs(queueAnswered - agentAnswered);
  if (diff > 2) {
    return {
      severity: 'info',
      title: 'Data Mismatch',
      message: `Queue report shows ${queueAnswered} answered calls but Call Log shows ${agentAnswered} for ${formatDate(date)}. Difference of ${diff} \u2014 may be due to report timing or filters.`,
      date,
      queueAnswered,
      agentAnswered,
    };
  }
  return null;
}

function detectZeroOutbound(callLogData, date, employeeId) {
  const agentCalls = callLogData.filter(
    (c) => c.call_date === date && c.employee_user_id === employeeId
  );
  const hasInbound = agentCalls.some((c) => c.call_direction === 'Inbound');
  const hasOutbound = agentCalls.some((c) => c.call_direction === 'Outbound');

  if (hasInbound && !hasOutbound) {
    return {
      severity: 'warning',
      title: 'Zero Outbound Activity',
      message: `Agent had inbound activity on ${formatDate(date)} but made zero outbound calls.`,
      date,
    };
  }
  return null;
}

// ── Main Alert Runner ───────────────────────────────────────────────────────────

export function generateAlerts(queueData, callLogData, weekStart, employeeId) {
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

  // Sort: critical first, then warning, then info
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

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

// ── Component ───────────────────────────────────────────────────────────────────

export default function CoverageAlerts({ queueData = [], callLogData = [], weekStart, employeeId }) {
  const alerts = generateAlerts(queueData, callLogData, weekStart, employeeId);

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert, i) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;

        return (
          <div key={i} className={`flex gap-3 p-4 rounded-lg ${config.bg} ${config.border}`}>
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
            <div>
              <p className={`text-sm font-semibold ${config.text}`}>
                {alert.title} {alert.date && `\u2014 ${formatDate(alert.date)}`}
              </p>
              <p className={`text-sm ${config.text} mt-0.5`}>{alert.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
