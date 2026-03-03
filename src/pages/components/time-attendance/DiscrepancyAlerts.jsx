// src/pages/components/time-attendance/DiscrepancyAlerts.jsx
// Cross-check alerts between time entries and RingCentral data.
//
// Revised: Uses total handle time and answer rate as proxy indicators
// for desk presence and engagement (RC does not export logged-in time).

import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

const SEVERITY_CONFIG = {
  red: { icon: AlertCircle, bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', iconColor: 'text-red-600' },
  yellow: { icon: AlertTriangle, bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-800', iconColor: 'text-yellow-600' },
  info: { icon: Info, bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', iconColor: 'text-blue-600' },
};

function checkDiscrepancies(timeEntries, rcData) {
  const alerts = [];

  if (!timeEntries || timeEntries.length === 0) return alerts;
  if (!rcData) return alerts;

  const totalHoursLogged = timeEntries.reduce((sum, e) => sum + (parseFloat(e.hours_worked) || 0), 0);
  const totalHandleTimeHours = (rcData.total_handle_time_minutes || 0) / 60;
  const regOrWfhDays = timeEntries.filter((e) => ['REG', 'WFH'].includes(e.code));
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
    });
  }

  // Check 3: RC shows 0 outbound on a REG/WFH day
  if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
    alerts.push({
      severity: 'yellow',
      title: 'Zero Outbound Calls',
      detail: `${regOrWfhDays.length} working day(s) logged, but 0 outbound calls recorded in RingCentral.`,
      meaning: 'Zero proactivity on standard working days.',
    });
  }

  // Check 4: Answer rate < 80% for the week
  if (rcData.inbound_calls > 0 && answerRate < 80) {
    alerts.push({
      severity: 'yellow',
      title: 'Low Answer Rate',
      detail: `Answer rate is ${answerRate.toFixed(1)}% (${rcData.answered_calls} answered / ${rcData.inbound_calls} inbound).`,
      meaning: 'Excessive missed inbound calls — may indicate away from desk.',
    });
  }

  // Check 5: Avg hold time > 5 min
  if (avgHoldTime > 5) {
    alerts.push({
      severity: 'yellow',
      title: 'High Hold Time',
      detail: `Average hold time is ${avgHoldTime.toFixed(1)} min (target: < 2 min).`,
      meaning: 'Callers being parked too long — quality concern.',
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
    });
  }

  return alerts;
}

export default function DiscrepancyAlerts({ timeEntries, rcData, weekStart }) {
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

  const alerts = checkDiscrepancies(timeEntries, rcData, weekStart);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600" />
        Cross-Check Alerts ({alerts.length})
      </h4>
      {alerts.map((alert, i) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;

        return (
          <div key={i} className={`flex gap-3 p-4 rounded-lg border ${config.bg} ${config.border}`}>
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
            <div>
              <p className={`text-sm font-semibold ${config.text}`}>{alert.title}</p>
              <p className={`text-sm ${config.text} mt-0.5`}>{alert.detail}</p>
              <p className="text-xs text-gray-600 mt-1">{alert.meaning}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
