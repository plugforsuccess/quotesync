// List follow-up sequences: up to 3 emails on their days, in order, spaced out, and they
// stop for good when the person uploads, gets quoted, or unsubscribes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, LATE_DAYS } from '../../supabase/functions/list-followups/plan.ts';
import { listStepTemplate, EMAIL_TEMPLATES } from '../../supabase/functions/_shared/emailTemplates.ts';
import { renderEmail } from '../../supabase/functions/_shared/email.ts';

const now = new Date('2026-11-20T15:17:00Z');
const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
const seq = [{ day: 3, on: true }, { day: 10, on: true }, { day: 30, on: true }];
const none = { unsubscribed: false, uploaded: false, quoted: false };
const m = (over) => ({ email: 'dana@example.com', source: 'quick_send', created_at: at(3), steps_sent: 0, last_sent_at: null, stopped_reason: null, ...over });

test('email 1 on its day, then 2 and 3 on theirs', () => {
  assert.equal(nextStep(m({ created_at: at(2) }), seq, none, now), null);
  assert.deepEqual(nextStep(m({ created_at: at(2.95) }), seq, none, now), { step: 0 }); // a few minutes early is fine
  assert.deepEqual(nextStep(m({ created_at: at(10), steps_sent: 1, last_sent_at: at(7) }), seq, none, now), { step: 1 });
  assert.equal(nextStep(m({ created_at: at(9), steps_sent: 1, last_sent_at: at(6) }), seq, none, now), null);
  assert.deepEqual(nextStep(m({ created_at: at(30), steps_sent: 2, last_sent_at: at(20) }), seq, none, now), { step: 2 });
  assert.equal(nextStep(m({ created_at: at(60), steps_sent: 3, last_sent_at: at(30) }), seq, none, now), null); // done
});

test('the days are the principal’s; a switched-off email is skipped', () => {
  const custom = [{ day: 1, on: true }, { day: 5, on: false }, { day: 14, on: true }];
  assert.deepEqual(nextStep(m({ created_at: at(1) }), custom, none, now), { step: 0 });
  assert.equal(nextStep(m({ created_at: at(6), steps_sent: 1, last_sent_at: at(5) }), custom, none, now), null);
  assert.deepEqual(nextStep(m({ created_at: at(14), steps_sent: 1, last_sent_at: at(13) }), custom, none, now), { step: 2 });
  assert.equal(nextStep(m({ created_at: at(30) }), [{ day: 3, on: false }, { day: 10, on: false }, { day: 30, on: false }], none, now), null);
});

test('it stops when they upload, get quoted, or unsubscribe', () => {
  assert.deepEqual(nextStep(m(), seq, { ...none, uploaded: true }, now), { stop: 'uploaded' });
  assert.deepEqual(nextStep(m(), seq, { ...none, quoted: true }, now), { stop: 'quoted' });
  assert.deepEqual(nextStep(m(), seq, { ...none, unsubscribed: true }, now), { stop: 'unsubscribed' });
  assert.equal(nextStep(m({ stopped_reason: 'uploaded' }), seq, none, now), null);
});

test('imports go whenever their wave comes, still spaced out; stale producer adds don’t start', () => {
  assert.deepEqual(nextStep(m({ source: 'import', created_at: at(90) }), seq, none, now), { step: 0 });
  // Email 1 went out late (day 85): email 2 waits 7 days (10 − 3), not straight away.
  assert.equal(nextStep(m({ source: 'import', created_at: at(90), steps_sent: 1, last_sent_at: at(5) }), seq, none, now), null);
  assert.deepEqual(nextStep(m({ source: 'import', created_at: at(90), steps_sent: 1, last_sent_at: at(7) }), seq, none, now), { step: 1 });
  assert.equal(nextStep(m({ created_at: at(3 + LATE_DAYS + 1) }), seq, none, now), null);
});

test('a customized list uses its own lines; anything it didn’t change comes from the shared emails', () => {
  const saved = {
    'email.list.step1.subject': 'Shared subject, [first name]',
    'email.list.step1.2': 'Shared line two: [link]',
    'email.list.L1.step1.2': 'Hey [first name], frat-brother version: [link]',
  };
  const vars = { 'first name': 'Dana', producer: 'Cam', link: 'https://insuredbycam.com/?start=1' };
  const own = listStepTemplate(1, 'L1', true, saved);
  const a = renderEmail({ ...own, vars });
  assert.equal(a.subject, 'Shared subject, Dana');
  assert.match(a.text, /frat-brother version/);
  assert.equal(own.template.key, 'email.list.L1.step1');
  const shared = renderEmail({ ...listStepTemplate(1, 'L1', false, saved), vars });
  assert.match(shared.text, /Shared line two/);
  assert.equal(listStepTemplate(2, null, true, saved).template, EMAIL_TEMPLATES.listStep2);
});
