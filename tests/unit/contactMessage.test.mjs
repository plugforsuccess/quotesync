// Sales workspace: the message written for a saved quote.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactMessage } from '../../src/pages/components/sales/contactMessage.js';

test('saves and same ask for a Y; costs more is honest and promises a re-check', () => {
  const saves = contactMessage('saves', { first: 'Dana', producer: 'Amy', allstate: 8400, diff: 1516 });
  assert.match(saves, /^Hi Dana, it's Amy with Cam Wiley Agency\./);
  assert.match(saves, /\$8,400 a year, saving you \$1,516\. Reply Y/);
  assert.match(contactMessage('same', { first: 'Dana', allstate: 9900, diff: 16 }), /about the same .* Reply Y/);
  const more = contactMessage('more', { first: null, allstate: 11000, diff: -1084 });
  assert.match(more, /^Hi there/);
  assert.match(more, /hard to beat .* before your next renewal\.$/);
  assert.doesNotMatch(more, /Reply Y/);
});

test('quoted (nothing to compare with) gives the price and asks for a Y', () => {
  assert.match(contactMessage('quoted', { first: 'Lee', producer: 'Amy', allstate: 3204 }), /^Hi Lee, it's Amy with Cam Wiley Agency\. I put together a new Allstate quote for you: \$3,204 a year\. Reply Y/);
});
