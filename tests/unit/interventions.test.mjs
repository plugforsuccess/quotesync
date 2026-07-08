// Unit tests for the required-quote guard on quote-claiming tactics.
// Run: node --test tests/unit/interventions.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { missingRequiredQuote, EMPTY_INTERVENTION } from '../../src/lib/interventions.js';

const TYPES = [
  { code: 'bundle', captures_premium: true },
  { code: 'requote_deductible', captures_premium: true },
  { code: 'discount', captures_premium: false },
  { code: 'spoke_no_decision', captures_premium: false },
];

test('quote tactic with no premium → blocked', () => {
  assert.equal(missingRequiredQuote({ interventions: ['bundle'], offeredPremium: '' }, TYPES), true);
  assert.equal(missingRequiredQuote({ interventions: ['bundle'], offeredPremium: '0' }, TYPES), true);
  assert.equal(missingRequiredQuote({ interventions: ['bundle'], offeredPremium: 'abc' }, TYPES), true);
});

test('quote tactic with a premium → allowed', () => {
  assert.equal(missingRequiredQuote({ interventions: ['bundle'], offeredPremium: '1534' }, TYPES), false);
  assert.equal(missingRequiredQuote({ interventions: ['requote_deductible', 'discount'], offeredPremium: '940.50' }, TYPES), false);
});

test('non-quote tactics never require a premium', () => {
  assert.equal(missingRequiredQuote({ interventions: ['discount'], offeredPremium: '' }, TYPES), false);
  assert.equal(missingRequiredQuote({ interventions: ['spoke_no_decision'], offeredPremium: '' }, TYPES), false);
  assert.equal(missingRequiredQuote(EMPTY_INTERVENTION, TYPES), false);
  assert.equal(missingRequiredQuote(null, TYPES), false);
});
