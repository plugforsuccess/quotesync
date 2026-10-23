import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWinbackNote } from '../../src/lib/winbackNote.js';

test('reads the termination story out of the note', () => {
  assert.deepEqual(parseWinbackNote('Winback: lost auto 01/2026 — Insured Request — $3156'),
    { line: 'Auto', month: '01/2026', reason: 'Insured Request', premium: 3156 });
  assert.deepEqual(parseWinbackNote('Winback: lost ho 02/2026 — Non-Pay - Issued Not Taken Renewal Premium Due — $370'),
    { line: 'Home', month: '02/2026', reason: 'Non-Pay - Issued Not Taken Renewal Premium Due', premium: 370 });
  assert.deepEqual(parseWinbackNote('Winback: lost landlord 01/2026 — Property - Insureds Request - All Other — $1,362'),
    { line: 'Landlord', month: '01/2026', reason: 'Property - Insureds Request - All Other', premium: 1362 });
});

test('partial notes and non-winback notes', () => {
  assert.deepEqual(parseWinbackNote('Winback: lost boat'), { line: 'Boat', month: null, reason: null, premium: null });
  assert.equal(parseWinbackNote('Call back Tuesday'), null);
  assert.equal(parseWinbackNote(null), null);
});
