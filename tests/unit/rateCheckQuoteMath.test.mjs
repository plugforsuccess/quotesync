// Quote cards: savings per policy, the household goal header, the big-drop warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savings, householdGoal, looksTooLow } from '../../src/pages/components/rate-checks/quoteMath.js';

test('savings per policy, whole dollars', () => {
  assert.deepEqual(savings(6980, 1320), { delta: 5660, pct: 81 });
  assert.deepEqual(savings(2936.4, 3100.2), { delta: -164, pct: -6 });
  assert.equal(savings(6980, ''), null);
  assert.equal(savings(null, 1320), null);
  assert.equal(savings(6980, 0), null);
});

test('household goal: target, quoted count, saved so far, bundle', () => {
  const auto = { annual_premium: 6980, allstate_premium: null };
  const home = { annual_premium: 2936, allstate_premium: null };
  assert.deepEqual(householdGoal([auto, home]),
    { target: 9916, quoted: 0, total: 2, saved: null, bundleAllstate: null, bundleCurrent: null });
  assert.deepEqual(householdGoal([{ ...auto, allstate_premium: 1320 }, home]),
    { target: 9916, quoted: 1, total: 2, saved: 5660, bundleAllstate: 1320, bundleCurrent: 6980 });
  const both = householdGoal([{ ...auto, allstate_premium: 1320 }, { ...home, allstate_premium: 3400 }]);
  assert.equal(both.saved, 5196);
  assert.equal(both.bundleAllstate, 4720);
});

test('big drop warning under 25% of what they pay now', () => {
  assert.equal(looksTooLow(6980, 1320), true);
  assert.equal(looksTooLow(6980, 1800), false);
  assert.equal(looksTooLow(null, 100), false);
});
