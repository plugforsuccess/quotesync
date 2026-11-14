// Scans & Quotes: daily/weekly/month pace, sources, per-person tallies, Scan Rate, report days.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, lastDays, summarize, scanRate, goalText, reportDays } from '../../src/lib/scanGoals.js';

const base = {
  today: '2026-11-14', is_manager: true, me: 'u1', goal_scans: 8.5, goal_people: 8,
  scans: [
    { day: '2026-11-14', source: 'affiliate', user_id: null, n: 2 },
    { day: '2026-11-14', source: 'staff', user_id: 'u1', n: 1 },
    { day: '2026-11-10', source: 'website', user_id: null, n: 3 },
    { day: '2026-10-31', source: 'website', user_id: null, n: 5 }, // last month
  ],
  quotes: [
    { day: '2026-11-14', user_id: 'u1', people: 5, policies: 7, with_scan: 2 },
    { day: '2026-11-13', user_id: 'u1', people: 8, policies: 9, with_scan: 4 },
    { day: '2026-11-14', user_id: 'u2', people: 1, policies: 1, with_scan: 0 },
  ],
  team_quotes: [
    { day: '2026-11-14', people: 6, policies: 8, with_scan: 2 },
    { day: '2026-11-13', people: 8, policies: 9, with_scan: 4 },
  ],
  team: [{ user_id: 'u1', name: 'Cam', role: 'principal' }, { user_id: 'u2', name: 'Logan', role: 'employee' }],
};

test('dates', () => {
  assert.equal(addDays('2026-11-01', -1), '2026-10-31');
  assert.deepEqual(lastDays('2026-03-02', 3), ['2026-02-28', '2026-03-01', '2026-03-02']);
});

test('today, week and month pace', () => {
  const g = summarize(base);
  assert.equal(g.todayScans, 3);
  assert.equal(g.weekScans, 6); // Nov 8–14
  assert.equal(g.month.scans, 6); // October excluded
  assert.equal(g.month.days, 30);
  assert.equal(g.month.goal, 255);
  assert.equal(g.month.pace, 119);
  assert.equal(g.month.projected, 13);
  assert.equal(g.last14.length, 14);
  assert.equal(g.last14.at(-1).n, 3);
});

test('sources this month', () => {
  const g = summarize(base);
  const by = Object.fromEntries(g.sources.map(s => [s.key, s.n]));
  assert.deepEqual(by, { affiliate: 2, quick_send: 0, link: 0, staff: 1, website: 3 });
});

test('people: today, week, scans brought in, Scan Rate', () => {
  const g = summarize(base);
  const cam = g.people.find(p => p.user_id === 'u1');
  assert.deepEqual(cam.today, { people: 5, policies: 7, with_scan: 2, scans: 1 });
  assert.equal(cam.week.people, 13);
  assert.equal(scanRate(cam.month), 46);
  assert.equal(g.me.user_id, 'u1');
  assert.equal(g.people[0].user_id, 'u1'); // most quoted today first
  assert.equal(g.team.today.people, 6);
});

test('a quoter without a membership still shows', () => {
  const g = summarize({ ...base, quotes: [...base.quotes, { day: '2026-11-14', user_id: 'gone', people: 2, policies: 2, with_scan: 0 }] });
  assert.ok(g.people.some(p => p.user_id === 'gone'));
});

test('no data', () => {
  assert.equal(summarize(null), null);
  const g = summarize({ today: '2026-11-14', goal_scans: 8.5, goal_people: 8, me: 'x' });
  assert.equal(g.todayScans, 0);
  assert.equal(g.me.today.people, 0);
  assert.equal(scanRate({ people: 0, with_scan: 0 }), null);
});

test('goal text', () => {
  assert.equal(goalText(8.5), '8.5');
  assert.equal(goalText(8), '8');
  assert.equal(goalText(1 / 3), '0.3');
});

test('report days: 30, oldest first', () => {
  const days = reportDays({ ...base, binds: [{ day: '2026-11-13', n: 1 }], quotes: base.team_quotes });
  assert.equal(days.length, 30);
  assert.equal(days.at(-1).day, '2026-11-14');
  assert.deepEqual(days.at(-1), { day: '2026-11-14', scans: 3, people: 6, binds: 0 });
  assert.deepEqual(days.at(-2), { day: '2026-11-13', scans: 0, people: 8, binds: 1 });
});
