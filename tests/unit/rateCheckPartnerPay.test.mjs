// Partner pay: tiers, extra lines, one payout per household, month attribution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scheduleFrom, householdTier, households, partnerSummary, qualifies, monthsWithActivity,
} from '../../src/pages/components/rate-checks/partnerPay.js';

const scan = (o) => ({ id: Math.random().toString(36).slice(2), promoter_id: 'p1', status: 'extracted', duplicate_of: null, created_at: '2026-10-05T15:00:00Z', ...o });
const schedule = scheduleFrom([]);

test('default schedule, overridden by saved rows', () => {
  assert.deepEqual(schedule, { auto_home: 45, auto_renters: 15, home_only: 15, auto_only: 10, renters_only: 2, extra_line: 5 });
  assert.equal(scheduleFrom([{ tier: 'auto_home', amount: '40.00' }, { tier: 'nope', amount: 9 }]).auto_home, 40);
});

test('only read, non-duplicate, non-declined pages qualify', () => {
  assert.equal(qualifies(scan({ policy_type: 'auto' })), true);
  assert.equal(qualifies(scan({ policy_type: 'auto', duplicate_of: 'x' })), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', status: 'declined' })), false);
  assert.equal(qualifies(scan({ policy_type: 'auto', status: 'extract_failed' })), false);
  assert.equal(qualifies(scan({ policy_type: null })), false);
});

test('tiers by what the household sends', () => {
  const t = (...types) => householdTier(types.map(policy_type => scan({ policy_type })));
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

test('one payout per household (by phone), in the month of its first qualifying page', () => {
  const hh = households([
    scan({ phone: '6787726107', first_name: 'Stephen', policy_type: 'auto', created_at: '2026-09-30T20:00:00Z' }),
    scan({ phone: '6787726107', policy_type: 'home', created_at: '2026-10-02T12:00:00Z' }),
    scan({ phone: '6787726107', policy_type: 'auto', duplicate_of: 'dup' }),
    scan({ phone: '4045550100', first_name: 'Ana', policy_type: 'renters', status: 'won' }),
    scan({ phone: '4045550199', policy_type: null, status: 'extract_failed' }),
  ], schedule);
  const stephen = hh.find(h => h.phone === '6787726107');
  assert.deepEqual([stephen.tier, stephen.fee, stephen.month, stephen.firstName], ['auto_home', 45, '2026-09', 'Stephen']);
  const ana = hh.find(h => h.phone === '4045550100');
  assert.deepEqual([ana.tier, ana.fee, ana.won], ['renters_only', 2, true]);
  const failed = hh.find(h => h.phone === '4045550199');
  assert.deepEqual([failed.tier, failed.fee, failed.month], [null, 0, null]);

  const s = partnerSummary(hh, '2026-10');
  assert.deepEqual(s.month, { households: 1, owed: 2 });
  assert.equal(s.households, 2);
  assert.equal(s.won, 1);
  assert.equal(s.closeRate, 0.5);
  assert.equal(s.fees, 47);
  assert.equal(s.costPerWin, 47);
  assert.deepEqual(monthsWithActivity(hh, '2026-11'), ['2026-11', '2026-10', '2026-09']);
});
