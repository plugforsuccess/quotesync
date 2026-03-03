// src/pages/components/time-attendance/DiscrepancyAlerts.jsx
// Cross-check alerts between time entries and RingCentral data.
// Reads from discrepancy_alerts table (server-detected) with client-side fallback.
// Supports resolving alerts inline.

import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, MessageSquare, X } from 'lucide-react';
import { useDiscrepancyAlerts, useResolveAlert } from '../../../hooks/useDiscrepancyAlerts';

// ── Severity config ──────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
  warning: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', iconColor: 'text-yellow-600' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-600' },
  // Legacy severity names (from client-side computation)
  red: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
  yellow: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', iconColor: 'text-yellow-600' },
};

// ── Alert type labels ────────────────────────────────────────────────────────

const ALERT_TYPE_LABELS = {
  hours_mismatch: 'Hours Mismatch',
  office_offline: 'Office But Offline',
  zero_outbound: 'Zero Outbound Calls',
  low_utilization: 'Very Low Utilization',
  warn_utilization: 'Low Utilization',
  frequent_absence: 'Frequent Absences',
  low_daily_outbound: 'Low Daily Outbound',
};

// ── Client-side fallback detection (same as v1) ─────────────────────────────

function checkDiscrepancies(timeEntries, rcData) {
  const alerts = [];

  if (!timeEntries || timeEntries.length === 0) return alerts;
  if (!rcData) return alerts;

  const totalHoursLogged = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
  const loggedInHours = (rcData.logged_in_minutes || 0) / 60;
  const talkTimeHours = (rcData.talk_time_minutes || 0) / 60;
  const utilization = loggedInHours > 0 ? (talkTimeHours / loggedInHours) * 100 : 0;

  const regOrWfhDays = timeEntries.filter((e) => ['REG', 'WFH'].includes(e.code));

  if (totalHoursLogged >= 8 * regOrWfhDays.length * 0.8 && loggedInHours < 5 * regOrWfhDays.length * 0.5) {
    alerts.push({
      severity: 'red',
      title: 'Hours Mismatch',
      detail: `Time log shows ${totalHoursLogged.toFixed(1)}h total, but RingCentral shows only ${loggedInHours.toFixed(1)}h logged in.`,
      meaning: 'Employee may not have been at their desk or in the phone system.',
    });
  }

  const officeDays = timeEntries.filter((e) => e.location === 'OFFICE' && ['REG', 'WFH'].includes(e.code));
  if (officeDays.length > 0 && loggedInHours < 1) {
    alerts.push({
      severity: 'red',
      title: 'Office But Offline',
      detail: `${officeDays.length} office day(s) logged, but RingCentral shows < 1h logged in for the week.`,
      meaning: 'Possible missed login or location discrepancy.',
    });
  }

  if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
    alerts.push({
      severity: 'yellow',
      title: 'Zero Outbound Calls',
      detail: `${regOrWfhDays.length} working day(s) logged, but 0 outbound calls recorded in RingCentral.`,
      meaning: 'Zero proactivity on standard working days.',
    });
  }

  if (utilization < 10 && loggedInHours > 2) {
    alerts.push({
      severity: 'yellow',
      title: 'Very Low Utilization',
      detail: `Utilization is ${utilization.toFixed(1)}% (talk time: ${talkTimeHours.toFixed(1)}h / logged in: ${loggedInHours.toFixed(1)}h).`,
      meaning: 'Extremely low phone engagement relative to hours logged.',
    });
  }

  const sickEarlyDays = timeEntries.filter((e) => ['SICK', 'SICK_PART', 'EARLY'].includes(e.code));
  if (sickEarlyDays.length >= 3) {
    alerts.push({
      severity: 'info',
      title: 'Frequent Absences',
      detail: `${sickEarlyDays.length} sick/early entries in this week.`,
      meaning: 'Pattern may warrant a conversation.',
    });
  }

  return alerts;
}

// ── Resolve Alert Inline Form ────────────────────────────────────────────────

function ResolveForm({ alertId, onCancel }) {
  const [notes, setNotes] = useState('');
  const resolveAlert = useResolveAlert();

  function handleResolve() {
    resolveAlert.mutate({ alertId, notes });
  }

  return (
    <div className="mt-2 flex items-start gap-2">
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Optional notes..."
        className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      />
      <button
        onClick={handleResolve}
        disabled={resolveAlert.isPending}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors disabled:opacity-50"
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {resolveAlert.isPending ? 'Saving...' : 'Resolve'}
      </button>
      <button
        onClick={onCancel}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function DiscrepancyAlerts({ timeEntries, rcData, weekStart, employeeId }) {
  const [resolvingId, setResolvingId] = useState(null);

  // Fetch server-side alerts from the table
  const { data: tableAlerts = [], isLoading: alertsLoading } = useDiscrepancyAlerts(
    weekStart,
    employeeId
  );

  // Show informational banner when time entries exist but no RC data is available
  if ((!rcData || Object.keys(rcData).length === 0) && timeEntries && timeEntries.length > 0) {
    return (
      <div className="flex gap-3 p-4 rounded-lg border bg-gray-50 border-gray-200">
        <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-400" />
        <div>
          <p className="text-sm font-medium text-gray-700">No RingCentral data for this week</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Upload a RingCentral CSV on the CS Performance tab to enable cross-check alerts.
          </p>
        </div>
      </div>
    );
  }

  // Filter table alerts for this specific employee (if not already filtered by the hook)
  const employeeAlerts = employeeId && employeeId !== 'all'
    ? tableAlerts.filter((a) => a.employee_user_id === employeeId)
    : tableAlerts;

  const unresolvedAlerts = employeeAlerts.filter((a) => !a.resolved);
  const resolvedAlerts = employeeAlerts.filter((a) => a.resolved);

  // Client-side fallback: if no table alerts exist for this week, compute locally
  const clientAlerts = checkDiscrepancies(timeEntries, rcData);
  const hasTableAlerts = employeeAlerts.length > 0;
  const showFallback = !hasTableAlerts && !alertsLoading && clientAlerts.length > 0;

  if (unresolvedAlerts.length === 0 && resolvedAlerts.length === 0 && !showFallback) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600" />
        Cross-Check Alerts
        {unresolvedAlerts.length > 0 && (
          <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
            {unresolvedAlerts.length} unresolved
          </span>
        )}
      </h4>

      {/* Server-side alerts (from table) */}
      {unresolvedAlerts.map((alert) => {
        const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.warning;
        const Icon = config.icon;

        return (
          <div key={alert.id} className={`p-4 rounded-lg border ${config.bg} ${config.border}`}>
            <div className="flex gap-3">
              <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
              <div className="flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-semibold ${config.text}`}>
                    {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                  </p>
                  <button
                    onClick={() => setResolvingId(resolvingId === alert.id ? null : alert.id)}
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-green-700 hover:bg-green-50 rounded transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Resolve
                  </button>
                </div>
                <p className={`text-sm ${config.text} mt-0.5`}>{alert.message}</p>
                {resolvingId === alert.id && (
                  <ResolveForm alertId={alert.id} onCancel={() => setResolvingId(null)} />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Resolved alerts (collapsed) */}
      {resolvedAlerts.length > 0 && (
        <details className="group">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 transition-colors">
            {resolvedAlerts.length} resolved alert{resolvedAlerts.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 space-y-2">
            {resolvedAlerts.map((alert) => (
              <div key={alert.id} className="flex gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 opacity-60">
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-gray-600 line-through">
                    {ALERT_TYPE_LABELS[alert.alert_type] || alert.alert_type}
                  </p>
                  <p className="text-xs text-gray-500">{alert.message}</p>
                  {alert.resolution_notes && (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <MessageSquare className="w-3 h-3" />
                      {alert.resolution_notes}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Client-side fallback (shown when no server-detected alerts exist) */}
      {showFallback && (
        <>
          <p className="text-xs text-gray-500 italic">
            Potential alerts (not yet confirmed by server detection):
          </p>
          {clientAlerts.map((alert, i) => {
            const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.yellow;
            const Icon = config.icon;

            return (
              <div key={i} className={`flex gap-3 p-4 rounded-lg border border-dashed ${config.bg} ${config.border}`}>
                <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
                <div>
                  <p className={`text-sm font-semibold ${config.text}`}>{alert.title}</p>
                  <p className={`text-sm ${config.text} mt-0.5`}>{alert.detail}</p>
                  <p className="text-xs text-gray-600 mt-1">{alert.meaning}</p>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
