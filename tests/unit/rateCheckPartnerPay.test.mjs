// Partner pay: tiers, extra lines, one payout per household, month attribution,
// the quoted-or-7-days qualifier, page checks, the cap, and the $50 minimum.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleFrom, householdTier, households, partnerSummary, qualifies, monthsWithActivity, applyCap, groupHouseholds, payoutPlan,
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
  assert.deepEqual(payoutPlan(hh, [], '2026-08'), { months: [{ month: '2026-08', households: 1, amount: 2 }], amount: 2, carried: 0, underMinimum: true });
  assert.deepEqual(payoutPlan(hh, [], '2026-09'), { months: [{ month: '2026-08', households: 1, amount: 2 }, { month: '2026-09', households: 1, amount: 10 }], amount: 12, carried: 2, underMinimum: true });
  const oct = payoutPlan(hh, [], '2026-10');
  assert.deepEqual([oct.amount, oct.carried, oct.underMinimum, oct.months.length], [82, 12, false, 3]);
  // Once September is paid (and August with it), October stands alone.
  const after = payoutPlan(hh, [{ period: '2026-08-01' }, { period: '2026-09-01' }], '2026-10');
  assert.deepEqual([after.amount, after.carried], [70, 0]);
});
