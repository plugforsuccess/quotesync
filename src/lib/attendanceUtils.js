// src/lib/attendanceUtils.js

/**
 * Returns an array of YYYY-MM-DD strings for all Mon–Fri dates
 * between startDate and endDate (inclusive).
 * Both params are YYYY-MM-DD strings.
 */
export function getBusinessDays(startDate, endDate) {
  const days = [];
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    const dow = cur.getDay(); // 0=Sun, 6=Sat
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toLocaleDateString('en-CA')); // YYYY-MM-DD
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/**
 * Computes absence breakdown for a single employee over a date range.
 *
 * @param {string} employeeId        - auth_user_id
 * @param {string} hireDate          - YYYY-MM-DD from employees.hire_date
 * @param {Array}  entries           - array of employee_time_entries rows for this employee
 * @param {string} rangeStart        - YYYY-MM-DD
 * @param {string} rangeEnd          - YYYY-MM-DD (inclusive, capped at today)
 *
 * @returns {{
 *   sick: number,       // full SICK days (1.0 per SICK, 0.5 per SICK_PART)
 *   pto: number,        // count of PTO entries
 *   appt: number,       // count of APPT entries
 *   early: number,      // count of EARLY entries
 *   unexcused: number,  // business days with no entry at all
 *   daysWorked: number, // REG + WFH entries
 *   totalAbsences: number // sick + pto + appt + early + unexcused
 * }}
 */
export function computeAttendance(employeeId, hireDate, entries, rangeStart, rangeEnd) {
  const todayStr = new Date().toLocaleDateString('en-CA');
  const effectiveEnd = rangeEnd > todayStr ? todayStr : rangeEnd;
  const effectiveStart = hireDate && hireDate > rangeStart ? hireDate : rangeStart;

  if (effectiveStart > effectiveEnd) {
    return { sick: 0, pto: 0, appt: 0, early: 0, unexcused: 0, daysWorked: 0, totalAbsences: 0 };
  }

  const businessDays = getBusinessDays(effectiveStart, effectiveEnd);
  const entryMap = {}; // work_date → code
  for (const e of entries) {
    entryMap[e.work_date] = e.code;
  }

  let sick = 0, pto = 0, appt = 0, early = 0, unexcused = 0, daysWorked = 0;

  for (const day of businessDays) {
    const code = entryMap[day];
    if (!code) {
      unexcused++;
    } else if (code === 'SICK') {
      sick += 1.0;
    } else if (code === 'SICK_PART') {
      sick += 0.5;
    } else if (code === 'PTO') {
      pto++;
    } else if (code === 'APPT') {
      appt++;
    } else if (code === 'EARLY') {
      early++;
    } else if (code === 'REG' || code === 'WFH') {
      daysWorked++;
    }
  }

  const totalAbsences = sick + pto + appt + early + unexcused;
  return { sick, pto, appt, early, unexcused, daysWorked, totalAbsences };
}
