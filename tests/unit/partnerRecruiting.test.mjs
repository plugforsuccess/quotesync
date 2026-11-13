// Producers' partner floor: a partner counts once they've signed the agreement AND sent a
// qualified household, for the producer who recruited them, in the month of the later one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activations, activatedCount, recruitUrl } from '../../src/pages/components/rate-checks/partnerRecruiting.js';

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const scan = (o) => ({ id: Math.random().toString(36).slice(2), promoter_id: 'p1', phone: '4045550001', status: 'extracted', duplicate_of: null, created_at: '2026-11-05T15:00:00Z', carrier: 'State Farm', policy_type: 'auto', ...o });
const partner = (o) => ({ id: 'p1', name: 'Javon', phone: '6785550100', recruited_by: 'amy', agreement_signed_at: '2026-11-02T10:00:00Z', ...o });

test('signed + a qualified household = activated, credited to the recruiter', () => {
  const [a] = activations([partner()], [scan()], NOW);
  assert.equal(a.recruitedBy, 'amy');
  assert.equal(a.month, '2026-11');
  assert.equal(activatedCount([a], 'amy', '2026-11'), 1);
  assert.equal(activatedCount([a], 'bob', '2026-11'), 0);
});

test('signed but nobody sent: not activated', () => {
  assert.deepEqual(activations([partner()], [], NOW), []);
});

test('sent households but never signed: not activated', () => {
  assert.deepEqual(activations([partner({ agreement_signed_at: null })], [scan()], NOW), []);
});

test("only the partner's own policy, or pages that don't qualify: not activated", () => {
  assert.deepEqual(activations([partner()], [scan({ phone: '6785550100' })], NOW), []); // their own household
  assert.deepEqual(activations([partner()], [scan({ carrier: 'Allstate' })], NOW), []); // already Allstate
  assert.deepEqual(activations([partner()], [scan({ status: 'declined' })], NOW), []);
});

test('counts in the month of the later step', () => {
  // Household in October, signed in November: November.
  const [a] = activations([partner({ agreement_signed_at: '2026-11-03T10:00:00Z' })], [scan({ created_at: '2026-10-28T10:00:00Z' })], NOW);
  assert.equal(a.month, '2026-11');
  // Signed in October, first household in November: November.
  const [b] = activations([partner({ agreement_signed_at: '2026-10-10T10:00:00Z' })], [scan()], NOW);
  assert.equal(b.month, '2026-11');
});

test('recruit link', () => {
  assert.equal(recruitUrl('AB12CD34', 'https://insuredbycam.com'), 'https://insuredbycam.com/affiliates?by=AB12CD34');
});
