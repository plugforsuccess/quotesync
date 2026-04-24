// src/lib/erraticHours.js
// Helpers for detecting erratic / substandard attendance patterns.
// Shared between the UI (AttendanceFlagsBanner, ErraticHoursPanel)
// and the Excel export (TimeAttendancePage.jsx).

export const SEVERITY_ORDER = { CRITICAL: 0, WARNING: 1, INFO: 2 };

function r2(n) { return Math.round(n * 100) / 100; }

function groupBy(arr, keyFn) {
  const map = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  }
  return map;
}

function calcHoursFromEntry(e) {
  if (!e.start_time || !e.end_time) return 0;
  const [sh, sm] = e.start_time.split(':').map(Number);
  const [eh, em] = e.end_time.split(':').map(Number);
  let total = (eh * 60 + em) - (sh * 60 + sm);
  if (e.lunch_out && e.lunch_in) {
    const [loh, lom] = e.lunch_out.split(':').map(Number);
    const [lih, lim] = e.lunch_in.split(':').map(Number);
    total -= (lih * 60 + lim) - (loh * 60 + lom);
  } else if (e.unpaid_break_minutes) {
    total -= e.unpaid_break_minutes;
  }
  return Math.max(0, total / 60);
}

function getHours(e) {
  return parseFloat(e.hours_worked) || calcHoursFromEntry(e);
}

function codeCounts(entries) {
  const reg = entries.filter((e) => e.code === 'REG').length;
  const wfh = entries.filter((e) => e.code === 'WFH').length;
  const pto = entries.filter((e) => e.code === 'PTO').length;
  const sick = entries.filter((e) => e.code === 'SICK').length;
  const other = entries.filter((e) => ['SICK_PART', 'APPT', 'EARLY'].includes(e.code)).length;
  const daysWorked = entries.filter((e) => !['PTO', 'SICK'].includes(e.code)).length;
  const totalHours = entries.reduce((s, e) => s + getHours(e), 0);
  return { totalHours, daysWorked, reg, wfh, pto, sick, other };
}

/**
 * Compute YTD attendance flags per employee.
 * Used by both the UI banner and the Excel export so thresholds stay consistent.
 *
 * @param {Array} ytdEntries employee_time_entries rows for the year
 * @param {(id: string) => string} getEmployeeName resolves auth_user_id → name
 * @param {number} year
 * @returns {Array<{employeeId, name, flag, severity, detail}>} sorted CRITICAL → INFO
 */
export function computeAttendanceFlags(ytdEntries, getEmployeeName, year) {
  const byEmployee = groupBy(ytdEntries, (e) => e.employee_user_id);
  const flags = [];

  for (const [id, empEntries] of Object.entries(byEmployee)) {
    const name = getEmployeeName(id);
    const c = codeCounts(empEntries);
    const weeksSet = new Set(empEntries.map((e) => e.week_start));
    const weeksEntered = weeksSet.size;
    const avgPerWeek = weeksEntered > 0 ? c.totalHours / weeksEntered : 0;
    const totalDays = empEntries.length;

    if (weeksEntered >= 2 && avgPerWeek < 35) {
      flags.push({ employeeId: id, name, flag: 'Low Avg Hours/Week', severity: 'WARNING',
        detail: `${r2(avgPerWeek)}h avg over ${weeksEntered} weeks (expected ~40h)` });
    }
    if (c.pto > 15) {
      flags.push({ employeeId: id, name, flag: 'High PTO Usage', severity: 'INFO',
        detail: `${c.pto} PTO days used YTD` });
    }
    if (c.sick > 10) {
      flags.push({ employeeId: id, name, flag: 'High Sick Usage', severity: 'WARNING',
        detail: `${c.sick} sick days used YTD` });
    }
    if (c.other > 10) {
      flags.push({ employeeId: id, name, flag: 'Frequent Partial/Early/Appt', severity: 'INFO',
        detail: `${c.other} occurrences YTD` });
    }
    const sickPartial = empEntries.filter((e) => e.code === 'SICK' || e.code === 'SICK_PART').length;
    if (sickPartial > 12) {
      flags.push({ employeeId: id, name, flag: 'High Combined Sick Usage', severity: 'WARNING',
        detail: `${sickPartial} sick + partial sick days YTD` });
    }

    const yearStart = new Date(`${year}-01-01T00:00:00`);
    const now = new Date();
    const endDate = now.getFullYear() === year ? now : new Date(`${year}-12-31T00:00:00`);
    const expectedWeeks = Math.floor((endDate - yearStart) / (7 * 24 * 60 * 60 * 1000));
    const missingWeeks = expectedWeeks - weeksEntered;
    if (expectedWeeks > 4 && missingWeeks > 4) {
      flags.push({ employeeId: id, name, flag: 'Missing Time Entries', severity: 'WARNING',
        detail: `${missingWeeks} weeks missing out of ~${expectedWeeks} expected` });
    }

    if (totalDays >= 20) {
      const attendanceRate = c.daysWorked / totalDays;
      if (attendanceRate < 0.8) {
        flags.push({ employeeId: id, name, flag: 'Low Attendance Rate', severity: 'CRITICAL',
          detail: `${Math.round(attendanceRate * 100)}% attendance (${c.daysWorked}/${totalDays} days worked)` });
      }
    }

    const byWeek = groupBy(empEntries, (e) => e.week_start);
    let shortWeeks = 0;
    for (const [, weekEntries] of Object.entries(byWeek)) {
      const workDays = weekEntries.filter((e) => !['PTO', 'SICK'].includes(e.code));
      if (workDays.length >= 3) {
        const avgDayHours = workDays.reduce((s, e) => s + getHours(e), 0) / workDays.length;
        if (avgDayHours < 7) shortWeeks++;
      }
    }
    if (shortWeeks >= 3) {
      flags.push({ employeeId: id, name, flag: 'Frequent Short Days', severity: 'WARNING',
        detail: `${shortWeeks} weeks with avg < 7h/day` });
    }
  }

  flags.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));
  return flags;
}

// ── Erratic Hours detection (rolling short-window drift vs. default schedule) ──

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Detect per-employee erratic punches over a rolling window.
 * Looks for: start/end drift vs. the employee's default schedule, missed lunch,
 * short working days (< 7h), and weekend punches.
 *
 * @param {Array} entries      employee_time_entries rows for the window
 * @param {Array} employees    roster rows with default_start_time/default_end_time/etc.
 * @param {number} windowDays  how many recent days to consider (default 14)
 * @returns {Array<{employeeId, name, date, issues: string[], severity}>}
 */
export function detectErraticHours(entries, employees, windowDays = 14) {
  const DRIFT_MIN = 30; // minutes of drift to flag
  const SHORT_HOURS = 7;

  const todayStr = new Date().toLocaleDateString('en-CA');
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toLocaleDateString('en-CA');

  const byEmp = new Map();
  for (const emp of employees) {
    const id = emp.auth_user_id || emp.id;
    byEmp.set(id, emp);
  }

  const flagged = [];

  const recent = entries.filter((e) => e.work_date >= cutoffStr && e.work_date <= todayStr);
  for (const e of recent) {
    const emp = byEmp.get(e.employee_user_id);
    if (!emp) continue;
    const issues = [];
    let severity = 'INFO';

    const startDefault = toMinutes(emp.default_start_time);
    const endDefault = toMinutes(emp.default_end_time);
    const start = toMinutes(e.start_time);
    const end = toMinutes(e.end_time);

    if (e.code === 'REG' || e.code === 'WFH') {
      if (startDefault != null && start != null) {
        const drift = start - startDefault;
        if (drift >= DRIFT_MIN) {
          issues.push(`Late start (${drift}m after ${emp.default_start_time})`);
          severity = 'WARNING';
        } else if (drift <= -DRIFT_MIN) {
          issues.push(`Early start (${-drift}m before ${emp.default_start_time})`);
        }
      }
      if (endDefault != null && end != null) {
        const drift = end - endDefault;
        if (drift <= -DRIFT_MIN) {
          issues.push(`Early end (${-drift}m before ${emp.default_end_time})`);
          severity = 'WARNING';
        } else if (drift >= DRIFT_MIN) {
          issues.push(`Late end (${drift}m after ${emp.default_end_time})`);
        }
      }

      // Missed lunch-in after lunch-out
      if (e.lunch_out && !e.lunch_in && e.end_time) {
        issues.push('Missed lunch-in punch');
        severity = 'WARNING';
      }

      // Short day: clocked in and out but under threshold
      const hours = getHours(e);
      if (e.start_time && e.end_time && hours > 0 && hours < SHORT_HOURS) {
        issues.push(`Short day (${r2(hours)}h)`);
        if (hours < 5) severity = 'CRITICAL'; else severity = 'WARNING';
      }

      // Clocked in but never clocked out (and date is in the past)
      if (e.start_time && !e.end_time && e.work_date < todayStr) {
        issues.push('Never clocked out');
        severity = 'CRITICAL';
      }
    }

    // Weekend punches (Sat/Sun) on a REG/WFH code
    const dow = new Date(e.work_date + 'T00:00:00').getDay();
    if ((dow === 0 || dow === 6) && (e.code === 'REG' || e.code === 'WFH')) {
      issues.push('Weekend punch');
    }

    if (issues.length > 0) {
      flagged.push({
        employeeId: e.employee_user_id,
        name: emp.preferred_name || emp.first_name,
        date: e.work_date,
        issues,
        severity,
      });
    }
  }

  flagged.sort((a, b) => {
    const s = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (s !== 0) return s;
    return b.date.localeCompare(a.date);
  });

  return flagged;
}
