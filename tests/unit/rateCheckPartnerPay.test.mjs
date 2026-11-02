// Partner pay: tiers, extra lines, one payout per household, month attribution,
// the quoted-or-7-days qualifier, page checks, the cap, and the $50 minimum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleFrom, householdTier, households, partnerSummary, qualifies, monthsWithActivity, applyCap, groupHouseholds, payoutPlan,
  rulesFrom, DEFAULT_RULES,
} from '../../src/pages/components/rate-checks/partnerPay.js';

const NOW = new Date('2026-10-20T12:00:00Z').getTime();
const scan = (o) => ({ id: Math.random().toString(36).slice(2), promoter_id: 'p1', status: 'extracted', duplicate_of: null, created_at: '2026-10-05T15:00:00Z', carrier: 'State Farm', ...o });
const schedule = scheduleFrom([]);

test('default schedule, overridden by saved rows', () => {
  assert.deepEqual(schedule, { auto_home: 45, auto_renters: 15, home_only: 15, auto_only: 10, renters_only: 2, extra_line: 5 });
  assert.equal(scheduleFrom([{ tier: 'auto_home', amount: '40.00' }, { tier: 'nope', amount: 9 }]).auto_home, 40);
});

test('only read, non-duplicate, non-declined, non-Allstate, current pages qualify', () => {
  assert.equal(qualifies(scan({ policy_type: 'auto' }), NOW), true);
  assert.equal(qualifies(scan({ policy_type: 'auto', duplicate_of: 'x' }), NOW), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', status: 'declined' }), NOW), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', status: 'extract_failed' }), NOW), false);
  assert.equal(qualifies(scan({ policy_type: null }), NOW), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', carrier: 'Allstate' }), NOW), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', expiration_date: '2026-08-01' }), NOW), false); // expired 80 days ago
  assert.equal(qualifies(scan({ policy_type: 'auto', expiration_date: '2026-10-01' }), NOW), true); // 19 days ago: still current
  assert.equal(qualifies(scan({ policy_type: 'auto', expiration_date: null }), NOW), true);
});

test('tiers by what the household sends', () => {
  const t = (...types) => householdTier(types.map(policy_type => scan({ policy_type })), NOW);
  assert.deepEqual(t('auto', 'home'), { tier: 'auto_home', extras: 0, pages: 2 });
  assert.deepEqual(t('auto', 'condo'), { tier: 'auto_home', extras: 0, pages: 2 });
  assert.deepEqual(t('auto', 'renters'), { tier: 'auto_renters', extras: 0, pages: 2 });
  assert.deepEqual(t('home'), { tier: 'home_only', extras: 0, pages: 1 });
  assert.deepEqual(t('auto'), { tier: 'auto_only', extras: 0, pages: 1 });
  assert.deepEqual(t('renters'), { tier: 'renters_only', extras: 0, pages: 1 });
  // Umbrella and a second auto are extra lines, capped at 2.
  assert.deepEqual(t('auto', 'home', 'umbrella'), { tier: 'auto_home', extras: 1, pages: 3 });
  assert.deepEqual(t('auto', 'home', 'umbrella', 'auto', 'auto'), { tier: 'auto_home', extras: 2, pages: 5 });
  assert.deepEqual(t('umbrella'), { tier: null, extras: 0, pages: 1 });
});

test('one household per phone, address or policy number', () => {
  const groups = groupHouseholds([
    scan({ phone: '4045550001', insured_address: '255 Waltham Way, Fayetteville GA 30214' }),
    scan({ phone: '4045550002', insured_address: '255 WALTHAM WAY FAYETTEVILLE, GA 30214' }), // same house, new number
    scan({ phone: '4045550003', policy_number: '81-KE-X210-5' }),
    scan({ phone: '4045550004', policy_number: '81KEX2105' }), // same policy, new number
    scan({ phone: '4045550005' }),
  ]);
  assert.equal(groups.length, 3);
});

test('one payout per household, in the month of its first qualifying page', () => {
  const hh = households([
    scan({ phone: '6787726107', first_name: 'Stephen', policy_type: 'auto', created_at: '2026-09-30T20:00:00Z', allstate_premium: 1320, status: 'quoted' }),
    scan({ phone: '6787726107', policy_type: 'home', created_at: '2026-10-02T12:00:00Z' }),
    scan({ phone: '6787726107', policy_type: 'auto', duplicate_of: 'dup' }),
    scan({ phone: '4045550100', first_name: 'Ana', policy_type: 'renters', status: 'won' }),
    scan({ phone: '4045550199', policy_type: null, status: 'extract_failed' }),
  ], schedule, NOW);
  const stephen = hh.find(h => h.phone === '6787726107');
  assert.deepEqual([stephen.tier, stephen.fee, stephen.month, stephen.firstName, stephen.pays], ['auto_home', 45, '2026-09', 'Stephen', true]);
  const ana = hh.find(h => h.phone === '4045550100');
  assert.deepEqual([ana.tier, ana.fee, ana.won], ['renters_only', 2, true]);
  const failed = hh.find(h => h.phone === '4045550199');
  assert.deepEqual([failed.tier, failed.fee, failed.month], [null, 0, null]);

  const s = partnerSummary(hh, '2026-10');
  assert.deepEqual(s.month, { households: 1, owed: 2, pending: 0, overCap: 0 });
  assert.equal(s.households, 2);
  assert.equal(s.won, 1);
  assert.equal(s.closeRate, 0.5);
  assert.equal(s.fees, 47);
  assert.equal(s.costPerWin, 47);
  assert.deepEqual(monthsWithActivity(hh, '2026-11'), ['2026-11', '2026-10', '2026-09']);
});

test('a household pays once quoted, or 7 days after its first page', () => {
  const hh = households([
    scan({ phone: '4045550001', policy_type: 'auto', created_at: '2026-10-19T10:00:00Z' }), // yesterday, not quoted
    scan({ phone: '4045550002', policy_type: 'auto', created_at: '2026-10-19T10:00:00Z', allstate_premium: 900, status: 'lost' }), // quoted, lost: pays
    scan({ phone: '4045550003', policy_type: 'auto', created_at: '2026-10-10T10:00:00Z' }), // 10 days, never quoted: pays
  ], schedule, NOW);
  const by = Object.fromEntries(hh.map(h => [h.phone, h]));
  assert.deepEqual([by['4045550001'].pays, by['4045550001'].pending], [false, true]);
  assert.deepEqual([by['4045550002'].pays, by['4045550003'].pays], [true, true]);
  assert.deepEqual(partnerSummary(hh, '2026-10').month, { households: 3, owed: 20, pending: 1, overCap: 0 });
});

test('monthly cap: the first N households in a month are paid, the rest pay $0', () => {
  const hh = households([
    scan({ phone: '4045550001', policy_type: 'auto', created_at: '2026-10-01T10:00:00Z' }),
    scan({ phone: '4045550002', policy_type: 'auto', created_at: '2026-10-02T10:00:00Z' }),
    scan({ phone: '4045550002', policy_type: 'home', created_at: '2026-10-02T10:05:00Z' }),
    scan({ phone: '4045550003', policy_type: 'auto', created_at: '2026-10-03T10:00:00Z' }),
    scan({ phone: '4045550004', policy_type: 'auto', created_at: '2026-11-01T10:00:00Z' }),
  ], schedule, new Date('2026-11-20T00:00:00Z').getTime());
  const capped = applyCap(hh, 2);
  const by = Object.fromEntries(capped.map(h => [h.phone, h]));
  assert.deepEqual([by['4045550001'].fee, by['4045550002'].fee, by['4045550003'].fee], [10, 45, 0]);
  assert.equal(by['4045550003'].overCap, true);
  assert.equal(by['4045550004'].overCap, false); // new month, counts from zero
  assert.deepEqual(partnerSummary(capped, '2026-10').month, { households: 3, owed: 55, pending: 0, overCap: 1 });
  assert.equal(applyCap(hh, null).every(h => !h.overCap), true);
});

test('$50 minimum: small months carry over into the next payout', () => {
  const hh = households([
    scan({ phone: '4045550001', policy_type: 'renters', created_at: '2026-08-05T10:00:00Z' }), // $2 in August
    scan({ phone: '4045550002', policy_type: 'auto', created_at: '2026-09-05T10:00:00Z' }), // $10 in September
    scan({ phone: '4045550003', policy_type: 'auto', created_at: '2026-10-05T10:00:00Z' }), // $10 in October
    scan({ phone: '4045550004', policy_type: 'home', created_at: '2026-10-06T10:00:00Z' }), // $15
    scan({ phone: '4045550005', policy_type: 'auto', created_at: '2026-10-07T10:00:00Z' }), // $10
    scan({ phone: '4045550005', policy_type: 'home', created_at: '2026-10-07T10:00:00Z' }), // → $45
  ], schedule, NOW);
  // Paying on Nov 25: August, September and October are all past their pay day.
  const NOV25 = new Date('2026-11-25T15:00:00Z').getTime();
  assert.deepEqual(payoutPlan(hh, [], '2026-08', 50, NOV25), { months: [{ month: '2026-08', households: 1, amount: 2 }], amount: 2, carried: 0, underMinimum: true, upcoming: 0, upcomingPayDay: null, later: [] });
  assert.deepEqual(payoutPlan(hh, [], '2026-09', 50, NOV25).amount, 12);
  const oct = payoutPlan(hh, [], '2026-10', 50, NOV25);
  assert.deepEqual([oct.amount, oct.carried, oct.underMinimum, oct.months.length], [82, 12, false, 3]);
  // Once September is paid (and August with it), October stands alone.
  const after = payoutPlan(hh, [{ period: '2026-08-01' }, { period: '2026-09-01' }], '2026-10', 50, NOV25);
  assert.deepEqual([after.amount, after.carried], [70, 0]);
  // On Oct 20, only August is due (Sep 21); September waits for Oct 21, October for Nov 21.
  const oct20 = payoutPlan(hh, [], '2026-10', 50, NOW);
  assert.deepEqual([oct20.amount, oct20.upcoming, oct20.upcomingPayDay], [2, 80, '2026-10-21']);
});

test('1099 totals: what was paid in the year, by payment date', async () => {
  const { paidInYear } = await import('../../src/pages/components/rate-checks/partnerPay.js');
  const payouts = [
    // One October payment covering August + September (carried) + October.
    { promoter_id: 'p1', period: '2026-08-01', amount: '2.00', paid_at: '2026-10-31T15:00:00Z' },
    { promoter_id: 'p1', period: '2026-09-01', amount: '10.00', paid_at: '2026-10-31T15:00:00Z' },
    { promoter_id: 'p1', period: '2026-10-01', amount: '70.00', paid_at: '2026-10-31T15:00:00Z' },
    { promoter_id: 'p1', period: '2026-11-01', amount: '45.00', paid_at: '2026-12-01T15:00:00Z' },
    // Earned in 2026, paid in 2027: counts for 2027.
    { promoter_id: 'p1', period: '2026-12-01', amount: '60.00', paid_at: '2027-01-05T15:00:00Z' },
    { promoter_id: 'p2', period: '2026-06-01', amount: '55.50', paid_at: '2026-07-01T15:00:00Z' },
  ];
  const y = paidInYear(payouts, 2026);
  assert.deepEqual(y.p1, { amount: 127, payments: 2, months: ['2026-08', '2026-09', '2026-10', '2026-11'], lastPaid: '2026-12-01T15:00:00Z' });
  assert.equal(y.p2.amount, 55.5);
  assert.deepEqual(Object.keys(paidInYear(payouts, 2027)), ['p1']);
  assert.equal(paidInYear(payouts, 2027).p1.amount, 60);
});

test('payout rules: saved row overrides the defaults, Y required when nothing is saved', () => {
  assert.deepEqual(rulesFrom(null), DEFAULT_RULES);
  assert.equal(DEFAULT_RULES.requireCallConfirm, true);
  assert.deepEqual(rulesFrom({ require_call_confirm: false, quote_days: 5, expired_days: 60, min_payout: '25.00' }),
    { requireCallConfirm: false, quoteDays: 5, expiredDays: 60, minPayout: 25 });
});

test('with the Y rule, a household pays only after the customer replies Y', () => {
  const rules = rulesFrom(null);
  const old = '2026-09-01T12:00:00Z'; // long past the quote-or-7-days window
  const hh = households([
    scan({ phone: '4045550001', policy_type: 'auto', created_at: old, status: 'won', allstate_premium: 900, quote_ready_texted_at: old }),
    scan({ phone: '4045550002', policy_type: 'auto', created_at: old, status: 'won', allstate_premium: 900, quote_ready_texted_at: old, call_confirmed_at: old }),
  ], schedule, NOW, rules);
  const waiting = hh.find(h => h.phone === '4045550001');
  const confirmed = hh.find(h => h.phone === '4045550002');
  assert.deepEqual([waiting.pays, waiting.pending, waiting.texted, waiting.confirmed], [false, true, true, false]);
  assert.deepEqual([confirmed.pays, confirmed.pending, confirmed.confirmed], [true, false, true]);
});

test('rules change the expired-page window and the payout minimum', () => {
  const rules = { ...rulesFrom(null), requireCallConfirm: false, expiredDays: 120, minPayout: 5 };
  const hh = households([scan({ phone: '4045550003', policy_type: 'auto', expiration_date: '2026-08-01', status: 'quoted', allstate_premium: 1 })], schedule, NOW, rules);
  assert.equal(hh[0].tier, 'auto_only'); // 80 days expired: counts under a 120-day window
  assert.equal(payoutPlan(hh, [], '2026-10', rules.minPayout, new Date('2026-11-25T15:00:00Z').getTime()).underMinimum, false);
  assert.equal(payoutPlan(hh, [], '2026-10', undefined, new Date('2026-11-25T15:00:00Z').getTime()).underMinimum, true);
});

test('a month is paid on the 21st of the following month', async () => {
  const { payDay, isDue } = await import('../../src/pages/components/rate-checks/partnerPay.js');
  assert.equal(payDay('2026-10'), '2026-11-21');
  assert.equal(payDay('2026-12'), '2027-01-21');
  assert.equal(isDue('2026-10', new Date('2026-11-20T12:00:00Z').getTime()), false);
  assert.equal(isDue('2026-10', new Date('2026-11-21T12:00:00Z').getTime()), true);
  // Before pay day the plan shows what it comes to so far, but isn't due.
  const hh = households([scan({ phone: '4045550010', policy_type: 'auto', created_at: '2026-10-05T10:00:00Z', quoted_at: '2026-10-05T11:00:00Z' })], schedule, NOW);
  const early = payoutPlan(hh, [], '2026-10', 0, NOW);
  assert.deepEqual([early.amount, early.upcoming, early.upcomingPayDay], [0, 10, '2026-11-21']);
  assert.equal(payoutPlan(hh, [], '2026-10', 0, new Date('2026-11-21T15:00:00Z').getTime()).amount, 10);
  // Looking at November on Nov 25: October (due Nov 21) is payable, November waits for Dec 21.
  const hh2 = households([
    scan({ phone: '4045550011', policy_type: 'auto', created_at: '2026-10-05T10:00:00Z', quoted_at: '2026-10-05T11:00:00Z' }),
    scan({ phone: '4045550012', policy_type: 'home', created_at: '2026-11-05T10:00:00Z', quoted_at: '2026-11-05T11:00:00Z' }),
  ], schedule, new Date('2026-11-25T15:00:00Z').getTime());
  const nov = payoutPlan(hh2, [], '2026-11', 0, new Date('2026-11-25T15:00:00Z').getTime());
  assert.deepEqual([nov.months.map(m => m.month), nov.amount, nov.upcoming, nov.upcomingPayDay], [['2026-10'], 10, 15, '2026-12-21']);
});

test('the cap counts only households that pay, not ones still waiting', () => {
  const ph = (n) => `40455500${String(n).padStart(2, '0')}`;
  // With the reply-Y rule: the first two never replied, the next two did.
  const hh = households([
    scan({ phone: ph(1), policy_type: 'auto', created_at: '2026-10-01T10:00:00Z' }),
    scan({ phone: ph(2), policy_type: 'auto', created_at: '2026-10-02T10:00:00Z' }),
    scan({ phone: ph(3), policy_type: 'auto', created_at: '2026-10-03T10:00:00Z', call_confirmed_at: '2026-10-04T10:00:00Z' }),
    scan({ phone: ph(4), policy_type: 'auto', created_at: '2026-10-04T10:00:00Z', call_confirmed_at: '2026-10-05T10:00:00Z' }),
  ], schedule, NOW, DEFAULT_RULES);
  const capped = applyCap(hh, 2);
  assert.deepEqual(capped.filter(h => h.pays).map(h => [h.phone, h.fee, h.overCap]), [[ph(3), 10, false], [ph(4), 10, false]]);
});

test('months follow Georgia time, not the computer\'s', () => {
  // 11:30pm Oct 31 in Georgia is Nov 1 in UTC: still October.
  const hh = households([scan({ phone: '4045550020', policy_type: 'auto', created_at: '2026-11-01T03:30:00Z' })], schedule, NOW);
  assert.equal(hh[0].month, '2026-10');
});
