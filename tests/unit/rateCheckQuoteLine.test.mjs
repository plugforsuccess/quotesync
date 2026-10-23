// "Quote Allstate Home + Auto + PUP": products from the scans plus home ownership.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteProducts, quoteHeadline } from '../../src/pages/components/rate-checks/quoteLine.js';

const p = (policy_type, housing_situation = null) => ({ policy_type, housing_situation });

test('products come from the scans', () => {
  assert.deepEqual(quoteProducts([p('auto'), p('home')]), ['Home', 'Auto']);
  assert.deepEqual(quoteProducts([p('auto'), p('home'), p('umbrella')]), ['Home', 'Auto', 'PUP']);
  assert.deepEqual(quoteProducts([p('renters'), p('auto')]), ['Renters', 'Auto']);
});

test('ownership adds the property line they did not send', () => {
  assert.deepEqual(quoteProducts([p('auto', 'own')]), ['Home', 'Auto']);
  assert.deepEqual(quoteProducts([p('auto', 'rent')]), ['Renters', 'Auto']);
  assert.deepEqual(quoteProducts([p('auto', 'family')]), ['Auto']);
  assert.deepEqual(quoteProducts([p('condo', 'own'), p('auto')]), ['Condo', 'Auto']); // a scanned condo beats "owns"
});

test('the umbrella decision adds PUP', () => {
  assert.deepEqual(quoteProducts([p('auto', 'own')], 'quote_allstate_umbrella'), ['Home', 'Auto', 'PUP']);
});

test('headline only for straight Allstate quotes', () => {
  assert.equal(quoteHeadline([p('auto', 'own'), p('home')], 'quote_allstate'), 'Quote Allstate Home + Auto');
  assert.equal(quoteHeadline([p('umbrella')], 'quote_allstate'), 'Quote Allstate PUP');
  assert.equal(quoteHeadline([p('commercial')], 'quote_allstate'), 'Quote Allstate P&C');
  assert.equal(quoteHeadline([p('auto')], 'expanded_market'), null);
  assert.equal(quoteHeadline([p('auto')], 'refer'), null);
});
