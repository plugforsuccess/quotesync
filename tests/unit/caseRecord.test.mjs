// Unit tests for the no-undocumented-close record check.
// Run: node --test tests/unit/caseRecord.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMeaningfulNote, caseHasRecord } from '../../src/lib/caseRecord.js';

test('hasMeaningfulNote: blocks the punctuation/one-word bypass', () => {
  assert.equal(hasMeaningfulNote('.'), false);
  assert.equal(hasMeaningfulNote('ok'), false);
  assert.equal(hasMeaningfulNote('confirmed'), false);        // one word, no space
  assert.equal(hasMeaningfulNote('        '), false);
  assert.equal(hasMeaningfulNote(null), false);
  assert.equal(hasMeaningfulNote('paid 7/9, keep EFT on'), true);
  assert.equal(hasMeaningfulNote('spoke to spouse, staying'), true);
});

test('caseHasRecord: any case-log comment counts', () => {
  assert.equal(caseHasRecord({ caseNotes: [{ id: '1' }] }), true);
  assert.equal(caseHasRecord({ caseNotes: [] }), false);
  assert.equal(caseHasRecord({}), false);
});

test('caseHasRecord: meaningful Notes field or same-action note counts', () => {
  assert.equal(caseHasRecord({ caseNotesField: 'renewing, revisit deductible next term' }), true);
  assert.equal(caseHasRecord({ caseNotesField: 'ok' }), false);
  assert.equal(caseHasRecord({ extraNote: 'happy, confirmed staying on EFT' }), true);
});

test('caseHasRecord: genuine attempt notes count, auto-logged synthetics do not', () => {
  assert.equal(
    caseHasRecord({ attempts: [{ note: 'LVM, will retry Thursday', auto_logged: false }] }),
    true,
  );
  assert.equal(
    caseHasRecord({ attempts: [{ note: 'Outcome recorded from the work surface', auto_logged: true }] }),
    false,
  );
  assert.equal(caseHasRecord({ attempts: [{ note: null }, { note: 'ok' }] }), false);
});
