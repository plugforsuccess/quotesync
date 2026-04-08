// src/lib/federalHolidays.js
// Computes Allstate-observed federal holidays for a given year.
// Returns a Set of YYYY-MM-DD strings.

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

// nth weekday of a month: nthWeekday(2026, 5, 1, 4) = 4th Monday of May 2026
function nthWeekday(year, month, weekday, nth) {
  // weekday: 0=Sun,1=Mon,...,6=Sat
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (true) {
    if (d.getDay() === weekday) count++;
    if (count === nth) return d.getDate();
    d.setDate(d.getDate() + 1);
  }
}

// Last weekday of a month
function lastWeekday(year, month, weekday) {
  const d = new Date(year, month, 0); // last day of month
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return d.getDate();
}

export function getFederalHolidays(year) {
  const holidays = new Set();

  // New Year's Day — Jan 1 (observed Mon if Sun, Fri if Sat)
  const nyd = new Date(year, 0, 1);
  if (nyd.getDay() === 0) holidays.add(fmt(year, 1, 2));       // Sun → Mon
  else if (nyd.getDay() === 6) holidays.add(fmt(year - 1, 12, 31)); // Sat → prior Fri
  else holidays.add(fmt(year, 1, 1));

  // Memorial Day — last Monday of May
  holidays.add(fmt(year, 5, lastWeekday(year, 5, 1)));

  // Juneteenth — June 19 (observed)
  const jt = new Date(year, 5, 19);
  if (jt.getDay() === 0) holidays.add(fmt(year, 6, 20));
  else if (jt.getDay() === 6) holidays.add(fmt(year, 6, 18));
  else holidays.add(fmt(year, 6, 19));

  // Independence Day — July 4 (observed)
  const id4 = new Date(year, 6, 4);
  if (id4.getDay() === 0) holidays.add(fmt(year, 7, 5));
  else if (id4.getDay() === 6) holidays.add(fmt(year, 7, 3));
  else holidays.add(fmt(year, 7, 4));

  // Labor Day — first Monday of September
  holidays.add(fmt(year, 9, nthWeekday(year, 9, 1, 1)));

  // Thanksgiving — fourth Thursday of November
  holidays.add(fmt(year, 11, nthWeekday(year, 11, 4, 4)));

  // Christmas Day — Dec 25 (observed)
  const xmas = new Date(year, 11, 25);
  if (xmas.getDay() === 0) holidays.add(fmt(year, 12, 26));
  else if (xmas.getDay() === 6) holidays.add(fmt(year, 12, 24));
  else holidays.add(fmt(year, 12, 25));

  // Christmas Eve — Dec 24 (half day — mark as holiday but note noon close)
  const xeve = new Date(year, 11, 24);
  if (xeve.getDay() !== 0 && xeve.getDay() !== 6)
    holidays.add(fmt(year, 12, 24));

  // New Year's Eve — Dec 31 (half day)
  const nye = new Date(year, 11, 31);
  if (nye.getDay() !== 0 && nye.getDay() !== 6)
    holidays.add(fmt(year, 12, 31));

  return holidays;
}

// Human-readable label for a holiday date
const HOLIDAY_LABELS = {
  '01-01': "New Year's Day",
  '01-02': "New Year's Day (obs.)",
  '05-25': 'Memorial Day', '05-26': 'Memorial Day', '05-27': 'Memorial Day',
  '05-28': 'Memorial Day', '05-29': 'Memorial Day', '05-30': 'Memorial Day', '05-31': 'Memorial Day',
  '06-18': 'Juneteenth (obs.)', '06-19': 'Juneteenth', '06-20': 'Juneteenth (obs.)',
  '07-03': 'Independence Day (obs.)', '07-04': 'Independence Day', '07-05': 'Independence Day (obs.)',
  '09-01': 'Labor Day', '09-02': 'Labor Day', '09-03': 'Labor Day',
  '09-04': 'Labor Day', '09-05': 'Labor Day', '09-06': 'Labor Day', '09-07': 'Labor Day',
  '11-22': 'Thanksgiving', '11-23': 'Thanksgiving', '11-24': 'Thanksgiving',
  '11-25': 'Thanksgiving', '11-26': 'Thanksgiving', '11-27': 'Thanksgiving', '11-28': 'Thanksgiving',
  '12-24': 'Christmas Eve \u00bd',
  '12-25': 'Christmas Day', '12-26': 'Christmas Day (obs.)',
  '12-31': "New Year's Eve \u00bd",
};

export function getHolidayLabel(dateStr) {
  // dateStr = YYYY-MM-DD
  const mmdd = dateStr.slice(5);
  return HOLIDAY_LABELS[mmdd] || 'Holiday';
}
