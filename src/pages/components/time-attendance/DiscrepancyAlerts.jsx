// src/pages/components/time-attendance/DiscrepancyAlerts.jsx
// Cross-check alerts between time entries and RingCentral data.
//
// Revised: Uses total handle time and answer rate as proxy indicators
// for desk presence and engagement (RC does not export logged-in time).

import { T } from '../../../components/SiteCopy';
import { AlertTriangle, AlertCircle, CheckCircle, Info } from 'lucide-react';

const SEVERITY_CONFIG = {
  red: { icon: AlertCircle, bg: 'bg-red-900/20', border: 'border-red-700/40', text: 'text-red-300', iconColor: 'text-red-400' },
  yellow: { icon: AlertTriangle, bg: 'bg-amber-900/20', border: 'border-amber-700/40', text: 'text-amber-300', iconColor: 'text-amber-400' },
  info: { icon: Info, bg: 'bg-blue-900/20', border: 'border-blue-700/40', text: 'text-blue-300', iconColor: 'text-blue-400' },
};

function checkDiscrepancies(timeEntries, rcData, weekStart, roleType) {
  const alerts = [];

  if (!timeEntries || timeEntries.length === 0) return alerts;
  if (!rcData) return alerts;

  const regOrWfhDays = timeEntries.filter((e) => ['REG', 'WFH'].includes(e.code));

  // ── Producer-specific checks (outbound effort only) ───────────────────
  if (roleType === 'sales') {
    if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
      alerts.push({
        severity: 'yellow',
        title: 'Zero Outbound Calls',
        detail: `${regOrWfhDays.length} working day(s) logged, but 0 outbound calls recorded in RingCentral.`,
        meaning: 'Producer should be making prospecting calls on working days.',
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

export default function DiscrepancyAlerts({ timeEntries, rcData, weekStart, roleType = 'service' }) {
  // Show informational banner when time entries exist but no RC data is available
  if ((!rcData || Object.keys(rcData).length === 0) && timeEntries && timeEntries.length > 0) {
    return (
      <div className="flex gap-3 p-4 rounded-lg border bg-qs-elevated border-qs-border">
        <Info className="w-5 h-5 mt-0.5 flex-shrink-0 text-qs-muted" />
        <div>
          <p className="text-sm font-medium text-qs-text"><T k="pages.components.timeattendance.discrepancyalerts.f3b45e">No RingCentral data for this week</T></p>
          <p className="text-xs text-qs-subtle mt-0.5">
            <T k="pages.components.timeattendance.discrepancyalerts.bceb64">Upload a RingCentral XLSX on the CS Performance tab to enable cross-check alerts.</T>
          </p>
        </div>
      </div>
    );
  }

  const alerts = checkDiscrepancies(timeEntries, rcData, weekStart, roleType);

  if (alerts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-qs-bright uppercase tracking-wide flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <T k="pages.components.timeattendance.discrepancyalerts.e9a665">Cross-Check Alerts (</T>{alerts.length})
      </h4>
      {alerts.map((alert, i) => {
        const config = SEVERITY_CONFIG[alert.severity];
        const Icon = config.icon;

        return (
          <div key={i} className={`flex gap-3 p-4 rounded-lg border ${config.bg} ${config.border}`}>
            <Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${config.iconColor}`} />
            <div>
              <p className={`text-sm font-semibold ${config.text}`}><T>{alert.title}</T></p>
              <p className={`text-sm ${config.text} mt-0.5`}><T>{alert.detail}</T></p>
              <p className="text-xs text-qs-dim mt-1"><T>{alert.meaning}</T></p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Monthly bonus verification summary alert — service_outbound retention saves
export function BonusVerificationAlert({ verificationData, month }) {
  if (!verificationData) return null;
  if (verificationData.unverified === 0 && verificationData.noPhone === 0) {
    return (
      <div className="flex gap-3 p-4 rounded-lg border bg-emerald-900/20 border-emerald-700/40">
        <CheckCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-emerald-400" />
        <div>
          <p className="text-sm font-medium text-emerald-300">
            <T k="pages.components.timeattendance.discrepancyalerts.b1c94c">All</T> {verificationData.verified} <T k="pages.components.timeattendance.discrepancyalerts.4aab36">reached attempts verified against RingCentral</T>
          </p>
          <p className="text-xs text-emerald-400 mt-0.5">
            {month} <T k="pages.components.timeattendance.discrepancyalerts.f430d0">— full bonus eligibility confirmed</T>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {verificationData.unverified > 0 && (
        <div className="flex gap-3 p-4 rounded-lg border bg-red-900/20 border-red-700/40">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">
              {verificationData.unverified} <T k="pages.components.timeattendance.discrepancyalerts.e03965">reached attempt</T>{verificationData.unverified > 1 ? 's' : ''} <T k="pages.components.timeattendance.discrepancyalerts.c738e9">not found in RingCentral</T>
            </p>
            <p className="text-xs text-red-400 mt-1">
              <T k="pages.components.timeattendance.discrepancyalerts.5594d5">These saves are ineligible for bonus until a matching outbound connected call is found.</T>
            </p>
            <div className="mt-2 space-y-1">
              {(verificationData.attempts || [])
                .filter(a => !a.verified)
                .map(a => (
                  <div key={a.attemptId} className="text-xs text-red-300 flex gap-2">
                    <span className="font-mono">{a.policy_no}</span>
                    <span>{a.customer}</span>
                    <span className="text-red-400">{a.attemptDate}</span>
                    <span className="text-red-400 italic">
                      {a.reason === 'invalid_phone' ? <T k="pages.components.timeattendance.discrepancyalerts.6d0467">{'no phone on file'}</T> : <T k="pages.components.timeattendance.discrepancyalerts.68292d">{'no RC match'}</T>}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
      {verificationData.noPhone > 0 && (
        <div className="flex gap-3 p-4 rounded-lg border bg-amber-900/20 border-amber-700/40">
          <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-300">
              {verificationData.noPhone} <T k="pages.components.timeattendance.discrepancyalerts.cd14c3">case</T>{verificationData.noPhone > 1 ? 's' : ''} <T k="pages.components.timeattendance.discrepancyalerts.04ed8e">missing phone number — cannot verify</T>
            </p>
            <p className="text-xs text-amber-400 mt-0.5">
              <T k="pages.components.timeattendance.discrepancyalerts.16792c">Add phone numbers to these cases to enable RC verification.</T>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
