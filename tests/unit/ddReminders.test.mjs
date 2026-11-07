// Drivers Ed reminder emails: when each one is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retakeDeadline, lastRenewalBefore, dueReminder } from '../../supabase/functions/dd-reminders/plan.ts';

test('the deadline is the last auto renewal before the 36-month expiry', () => {
  // Passed 2026-06-04 → expires 2029-06-04. Renewals every 6 months from 2026-03-15:
  // … 2028-09-15, 2029-03-15 (last before expiry), 2029-09-15.
  assert.equal(lastRenewalBefore('2026-03-15', '2029-06-04'), '2029-03-15');
  assert.equal(retakeDeadline('2026-06-04T23:40:00Z', '2026-03-15'), '2029-03-15');
  // A renewal on file that's later than the expiry walks back.
  assert.equal(lastRenewalBefore('2030-01-10', '2029-06-04'), '2029-01-10');
  // No renewal on file: the expiry.
  assert.equal(retakeDeadline('2026-06-04T23:40:00Z', null), '2029-06-04');
});

test('retake reminders 60 and 14 days out, once each, never late', () => {
  const s = { status: 'completed', enrolledOn: '2026-06-01', passedOn: '2026-06-04', lastRenewal: '2026-03-15' };
  const due = '2029-03-15';
  assert.deepEqual(dueReminder(s, '2029-01-14', new Set()), { kind: 'retake_60', dueOn: due });
  assert.equal(dueReminder(s, '2029-01-14', new Set([`retake_60|${due}`])), null);
  assert.deepEqual(dueReminder(s, '2029-03-01', new Set([`retake_60|${due}`])), { kind: 'retake_14', dueOn: due });
  // Not yet in the window, or already past the deadline.
  assert.equal(dueReminder(s, '2028-12-01', new Set()), null);
  assert.equal(dueReminder(s, '2029-03-20', new Set()), null);
  // Switched on late (inside 14 days): only the 14-day one, not both.
  assert.deepEqual(dueReminder(s, '2029-03-10', new Set()), { kind: 'retake_14', dueOn: due });
});

test('stalled students: 3 and 10 days after enrolling, not after they finish', () => {
  const s = { status: 'active', enrolledOn: '2026-11-01T15:00:00Z', passedOn: null, lastRenewal: null };
  assert.equal(dueReminder(s, '2026-11-02', new Set()), null);
  assert.deepEqual(dueReminder(s, '2026-11-04', new Set()), { kind: 'stall_3', dueOn: '2026-11-01' });
  assert.deepEqual(dueReminder(s, '2026-11-11', new Set(['stall_3|2026-11-01'])), { kind: 'stall_10', dueOn: '2026-11-01' });
  assert.equal(dueReminder(s, '2026-12-15', new Set()), null); // long stalled: no blast when switched on
  assert.equal(dueReminder({ ...s, status: 'completed' }, '2026-11-04', new Set()), null);
});
