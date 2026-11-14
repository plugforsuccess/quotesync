// src/lib/scanGoals.js
// Scans & Quotes goals: turns scan_goals() / scan_report() rows into what the Goals tab,
// the Today strip and the shared report show.
//   Scans:  households that sent their policy, on the day their first page arrived.
//   People: households a producer quoted that day (scan or not). Policies ride beside it.
//   Scan Rate: people quoted who came with a scan.
// Days are calendar days in Georgia (the database sends them as YYYY-MM-DD).

export const SOURCES = [
  ['affiliate', 'Affiliates'],
  ['quick_send', 'Quick Send'],
  ['link', 'Producer Links'],
  ['staff', 'Scanned In Person'],
  ['website', 'Website'],
];
export const SOURCE_LABEL = Object.fromEntries(SOURCES);

/** "2026-11-14" plus n days. */
export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const daysInMonth = (iso) => { const [y, m] = iso.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
/** The last n days ending today, oldest first. */
export const lastDays = (today, n) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));

const sum = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
const zero = () => ({ people: 0, policies: 0, with_scan: 0, scans: 0 });
function tally(quotes, scans, days) {
  const inDays = (r) => days.has(r.day);
  const q = quotes.filter(inDays);
  return { people: sum(q, 'people'), policies: sum(q, 'policies'), with_scan: sum(q, 'with_scan'), scans: sum(scans.filter(inDays), 'n') };
}
/** Share of people quoted who came with a scan, 0–100, or null when nobody was quoted. */
export const scanRate = (t) => (t.people ? Math.round((t.with_scan / t.people) * 100) : null);
/** "8.5" stays "8.5", "8.0" reads "8". */
export const goalText = (n) => String(Math.round(Number(n) * 10) / 10);

/**
 * Everything the Goals tab and Today strip need, from scan_goals() (or scan_report(),
 * which has the same scans/quotes shape without names).
 */
export function summarize(d) {
  if (!d) return null;
  const today = d.today;
  const goalScans = Number(d.goal_scans) || 0;
  const goalPeople = Number(d.goal_people) || 0;
  const scans = d.scans || [];
  const teamQuotes = d.team_quotes || d.quotes || [];
  const byDay = {};
  for (const s of scans) byDay[s.day] = (byDay[s.day] || 0) + (Number(s.n) || 0);

  const monthStart = `${today.slice(0, 8)}01`;
  const dayOfMonth = Number(today.slice(8, 10));
  const monthDays = daysInMonth(today);
  const monthSet = new Set(lastDays(today, dayOfMonth));
  const weekSet = new Set(lastDays(today, 7));
  const todaySet = new Set([today]);
  const monthScans = scans.filter(s => s.day >= monthStart && s.day <= today);
  const monthTotal = sum(monthScans, 'n');

  const bySource = Object.fromEntries(SOURCES.map(([k]) => [k, 0]));
  for (const s of monthScans) bySource[s.source] = (bySource[s.source] || 0) + (Number(s.n) || 0);

  const week = lastDays(today, 7).reduce((t, day) => t + (byDay[day] || 0), 0);

  // People: one row per team member (managers see everyone; others only themselves).
  const quotes = d.quotes || [];
  const people = (d.team || []).map(m => {
    const mine = quotes.filter(q => q.user_id === m.user_id);
    const myScans = scans.filter(s => s.user_id === m.user_id);
    return {
      user_id: m.user_id, name: m.name, role: m.role,
      today: tally(mine, myScans, todaySet),
      week: tally(mine, myScans, weekSet),
      month: tally(mine, myScans, monthSet),
    };
  });
  // Anyone quoting with no active membership (a past producer) still shows up.
  for (const uid of new Set(quotes.map(q => q.user_id).filter(Boolean))) {
    if (!people.some(p => p.user_id === uid)) {
      const mine = quotes.filter(q => q.user_id === uid);
      const myScans = scans.filter(s => s.user_id === uid);
      people.push({ user_id: uid, name: 'Former team member', role: null, today: tally(mine, myScans, todaySet), week: tally(mine, myScans, weekSet), month: tally(mine, myScans, monthSet) });
    }
  }
  people.sort((a, b) => b.today.people - a.today.people || b.week.people - a.week.people || String(a.name).localeCompare(String(b.name)));

  return {
    today, goalScans, goalPeople, isManager: !!d.is_manager,
    todayScans: byDay[today] || 0,
    weekScans: week,
    weekAvg: Math.round((week / 7) * 10) / 10,
    last14: lastDays(today, 14).map(day => ({ day, n: byDay[day] || 0 })),
    month: {
      scans: monthTotal, dayOfMonth, days: monthDays,
      goal: Math.round(goalScans * monthDays),
      pace: Math.round(goalScans * dayOfMonth * 10) / 10,
      projected: dayOfMonth ? Math.round((monthTotal / dayOfMonth) * monthDays) : 0,
    },
    sources: SOURCES.map(([key, label]) => ({ key, label, n: bySource[key] || 0 })),
    team: {
      today: tally(teamQuotes, scans, todaySet),
      week: tally(teamQuotes, scans, weekSet),
      month: tally(teamQuotes, scans, monthSet),
    },
    people,
    me: people.find(p => p.user_id === d.me) || { ...zero(), today: zero(), week: zero(), month: zero() },
  };
}

/** Last 30 days for the shared report: per day scans, people quoted and binds. */
export function reportDays(d) {
  if (!d) return [];
  const map = (rows, key) => Object.fromEntries(Object.entries(rows.reduce((m, r) => { m[r.day] = (m[r.day] || 0) + (Number(r[key]) || 0); return m; }, {})));
  const scans = map(d.scans || [], 'n');
  const people = map(d.quotes || [], 'people');
  const binds = map(d.binds || [], 'n');
  return lastDays(d.today, 30).map(day => ({ day, scans: scans[day] || 0, people: people[day] || 0, binds: binds[day] || 0 }));
}
