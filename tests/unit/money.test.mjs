// Unit tests for the premium-field input sanitizer.
// Run: node --test tests/unit/money.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeMoneyInput, parseMoney } from '../../src/lib/money.js';

test('sanitizeMoneyInput: strips currency noise, keeps digits and one dot', () => {
  assert.equal(sanitizeMoneyInput('$1,240.50'), '1240.50');
  assert.equal(sanitizeMoneyInput('1 200'), '1200');
  assert.equal(sanitizeMoneyInput('abc'), '');
  assert.equal(sanitizeMoneyInput('12a4'), '124');
  assert.equal(sanitizeMoneyInput('1.2.3'), '1.23'); // second dot dropped
  assert.equal(sanitizeMoneyInput(''), '');
  assert.equal(sanitizeMoneyInput(null), '');
  assert.equal(sanitizeMoneyInput(940), '940');
});

test('parseMoney: null for unusable values, number otherwise', () => {
  assert.equal(parseMoney('940'), 940);
  assert.equal(parseMoney('$1,240.50'), 1240.5);
  assert.equal(parseMoney('.'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(undefined), null);
});
