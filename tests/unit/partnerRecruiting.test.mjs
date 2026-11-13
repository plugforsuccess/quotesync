// Producers' affiliate floor: an affiliate counts once their W-9 is on file (or the agreement
// is signed, if that's required) AND they've sent a qualified household, for the producer
// who recruited them, in the month of the later one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activations, activatedCount, recruitUrl } from '../../src/pages/components/rate-checks/partnerRecruiting.js';

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const scan = (o) => ({ id: Math.random().toString(36).slice(2), promoter_id: 'p1', phone: '4045550001', status: 'extracted', duplicate_of: null, created_at: '2026-11-05T15:00:00Z', carrier: 'State Farm', policy_type: 'auto', ...o });
const partner = (o) => ({ id: 'p1', name: 'Javon', phone: '6785550100', recruited_by: 'amy', w9_received_at: '2026-11-02T10:00:00Z', agreement_signed_at: null, ...o });

test('W-9 + a qualified household = activated, credited to the recruiter', () => {
  const [a] = activations([partner()], [scan()], NOW);
  assert.equal(a.recruitedBy, 'amy');
  assert.equal(a.month, '2026-11');
  assert.equal(activatedCount([a], 'amy', '2026-11'), 1);
  assert.equal(activatedCount([a], 'bob', '2026-11'), 0);
});

test('W-9 but nobody sent: not activated', () => {
  assert.deepEqual(activations([partner()], [], NOW), []);
});

test('sent households but no W-9: not activated', () => {
  assert.deepEqual(activations([partner({ w9_received_at: null })], [scan()], NOW), []);
});

test('with the agreement turned on, the signed agreement is what counts', () => {
  const on = { agreementRequired: true };
  assert.deepEqual(activations([partner()], [scan()], NOW, undefined, on), []); // W-9 only
  const [a] = activations([partner({ agreement_signed_at: '2026-11-02T10:00:00Z' })], [scan()], NOW, undefined, on);
  assert.equal(a.recruitedBy, 'amy');
});

test("only the partner's own policy, or pages that don't qualify: not activated", () => {
  assert.deepEqual(activations([partner()], [scan({ phone: '6785550100' })], NOW), []); // their own household
  assert.deepEqual(activations([partner()], [scan({ carrier: 'Allstate' })], NOW), []); // already Allstate
  assert.deepEqual(activations([partner()], [scan({ status: 'declined' })], NOW), []);
});

test('counts in the month of the later step', () => {
  // Household in October, W-9 in November: November.
  const [a] = activations([partner({ w9_received_at: '2026-11-03T10:00:00Z' })], [scan({ created_at: '2026-10-28T10:00:00Z' })], NOW);
  assert.equal(a.month, '2026-11');
  // W-9 in October, first household in November: November.
  const [b] = activations([partner({ w9_received_at: '2026-10-10T10:00:00Z' })], [scan()], NOW);
  assert.equal(b.month, '2026-11');
});

test('recruit link', () => {
  assert.equal(recruitUrl('AB12CD34', 'https://insuredbycam.com'), 'https://insuredbycam.com/affiliates?by=AB12CD34');
});
