// Sales workspace: Allstate quote vs what they pay now → saves / same / more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteResult } from '../../src/pages/components/sales/quoteResult.js';

test('saves, same and more', () => {
  assert.deepEqual(quoteResult(2400, 1800), { diff: 600, kind: 'saves' });
  assert.deepEqual(quoteResult(2400, 2600), { diff: -200, kind: 'more' });
  assert.equal(quoteResult(2400, 2390).kind, 'same'); // within $25
  assert.equal(quoteResult(9916, 9850).kind, 'same'); // within 1%
});

test('nothing to compare', () => {
  assert.equal(quoteResult(null, 1800), null);
  assert.equal(quoteResult(2400, 0), null);
});
