// One quote per policy: a household's auto + home is one record but counts as 2 quotes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteCount } from '../../src/lib/sales.js';

test('counts policies, not records', () => {
  assert.equal(quoteCount([{ lines: [{ product: 'auto' }, { product: 'home' }] }]), 2);
  assert.equal(quoteCount([{ lines: [{ product: 'auto' }] }, { lines: [{ product: 'renters' }] }]), 2);
  assert.equal(quoteCount([{ lines: [], products: ['auto', 'home', 'umbrella'] }]), 3); // older rows: products
  assert.equal(quoteCount([{}]), 1);
  assert.equal(quoteCount([]), 0);
});
