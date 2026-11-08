// List follow-up email: 3 days after a producer adds someone, once, never to imports or opt-outs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followUpsDue } from '../../supabase/functions/list-followups/plan.ts';

const now = new Date('2026-11-20T15:00:00Z');
const at = (daysAgo) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
const m = (over) => ({ id: 'x', email: 'dana@example.com', source: 'quick_send', created_at: at(3), followup_sent_at: null, ...over });

test('due 3 days after being added, within 14 days', () => {
  assert.equal(followUpsDue([m({ created_at: at(2.9) })], new Set(), now).length, 0);
  assert.equal(followUpsDue([m({ created_at: at(3) })], new Set(), now).length, 1);
  assert.equal(followUpsDue([m({ created_at: at(14) })], new Set(), now).length, 1);
  assert.equal(followUpsDue([m({ created_at: at(20) })], new Set(), now).length, 0); // no backlog when switched on
});

test('never twice, never to imported lists, never to someone who unsubscribed', () => {
  assert.equal(followUpsDue([m({ followup_sent_at: at(1) })], new Set(), now).length, 0);
  assert.equal(followUpsDue([m({ source: 'import' })], new Set(), now).length, 0);
  assert.equal(followUpsDue([m({ email: 'Dana@Example.com' })], new Set(['dana@example.com']), now).length, 0);
  assert.equal(followUpsDue([m({ source: 'app' })], new Set(), now).length, 1);
});
