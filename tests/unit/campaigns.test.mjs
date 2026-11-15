// Campaigns: steps go out in order on their days, never two a day; people stop when they
// leave the audience, send a policy, or finish; steps they can't get are skipped; texts
// say who they're from and how to opt out; quiet hours.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextAction, inSendWindow, linkFor, varsFor, textMessage, emailTemplate, fill } from '../../supabase/functions/campaigns-run/plan.ts';
import { renderEmail } from '../../supabase/functions/_shared/email.ts';

const now = new Date('2026-11-20T15:11:00Z'); // 10:11am Eastern
const ago = (d) => new Date(now.getTime() - d * 86400000).toISOString();
const drip = {
  kind: 'drip', stop_on_upload: true, send_at: null,
  steps: [
    { channel: 'email', day: 0, subject: 'Hi', body: 'Hi [first name],\n\nCheck your rate: [link]', button: 'rate_check', button_label: 'Check My Rate' },
    { channel: 'text', day: 3, body: 'Quick reminder [first name]: [link]', button: 'rate_check' },
    { channel: 'email', day: 10, subject: 'Last one', body: 'Still here.', button: 'none' },
  ],
};
const ok = { inAudience: true, uploadedSince: false, email: 'dana@example.com', unsubscribed: false, phone: '4045550123', smsOk: true, textOptedOut: false };
const enr = (o = {}) => ({ enrolled_at: ago(0.1), steps_done: 0, last_sent_at: null, stopped_reason: null, ...o });

test('the first step goes on day 0, the next waits for its day', () => {
  assert.deepEqual(nextAction(drip, enr(), ok, now), { send: 0, channel: 'email' });
  assert.equal(nextAction(drip, enr({ steps_done: 1, last_sent_at: ago(0.1) }), ok, now), null);
  assert.deepEqual(nextAction(drip, enr({ enrolled_at: ago(3), steps_done: 1, last_sent_at: ago(3) }), ok, now), { send: 1, channel: 'text' });
});

test('never two steps in one day, even when both are due', () => {
  const late = enr({ enrolled_at: ago(30), steps_done: 1, last_sent_at: ago(0.2) });
  assert.equal(nextAction(drip, late, ok, now), null);
  assert.deepEqual(nextAction(drip, { ...late, last_sent_at: ago(1) }, ok, now), { send: 1, channel: 'text' });
});

test('stops: left the audience, sent a policy, finished; stopped people get nothing', () => {
  assert.deepEqual(nextAction(drip, enr(), { ...ok, inAudience: false }, now), { stop: 'left_audience' });
  assert.deepEqual(nextAction(drip, enr(), { ...ok, uploadedSince: true }, now), { stop: 'uploaded' });
  assert.deepEqual(nextAction({ ...drip, stop_on_upload: false }, enr(), { ...ok, uploadedSince: true }, now), { send: 0, channel: 'email' });
  assert.deepEqual(nextAction(drip, enr({ steps_done: 3 }), ok, now), { stop: 'finished' });
  assert.equal(nextAction(drip, enr({ stopped_reason: 'uploaded' }), ok, now), null);
});

test('a step they can’t get is skipped', () => {
  assert.deepEqual(nextAction(drip, enr(), { ...ok, email: null }, now), { skip: 0, channel: 'email', note: 'no_email' });
  assert.deepEqual(nextAction(drip, enr(), { ...ok, unsubscribed: true }, now), { skip: 0, channel: 'email', note: 'unsubscribed' });
  const textDue = enr({ enrolled_at: ago(3), steps_done: 1, last_sent_at: ago(3) });
  assert.deepEqual(nextAction(drip, textDue, { ...ok, smsOk: false }, now), { skip: 1, channel: 'text', note: 'no_text_consent' });
  assert.deepEqual(nextAction(drip, textDue, { ...ok, textOptedOut: true }, now), { skip: 1, channel: 'text', note: 'replied_stop' });
});

test('a blast is one message at its send time', () => {
  const blast = { ...drip, kind: 'blast', send_at: ago(-0.1) };
  assert.equal(nextAction(blast, enr(), ok, now), null);
  assert.deepEqual(nextAction({ ...blast, send_at: ago(0.01) }, enr(), ok, now), { send: 0, channel: 'email' });
  assert.deepEqual(nextAction({ ...blast, send_at: ago(0.01) }, enr({ steps_done: 1 }), ok, now), { stop: 'finished' });
});

test('only 9am–8pm Eastern', () => {
  assert.equal(inSendWindow(new Date('2026-11-20T15:11:00Z')), true); // 10am EST
  assert.equal(inSendWindow(new Date('2026-11-20T13:11:00Z')), false); // 8am EST
  assert.equal(inSendWindow(new Date('2026-11-21T00:30:00Z')), true); // 7:30pm EST
  assert.equal(inSendWindow(new Date('2026-11-21T01:05:00Z')), false); // 8:05pm EST
  assert.equal(inSendWindow(new Date('2026-07-20T23:30:00Z')), true); // 7:30pm EDT
});

test('links and blanks', () => {
  const site = 'https://insuredbycam.com';
  assert.equal(linkFor('rate_check', site), `${site}/?start=1`);
  assert.equal(linkFor('their_link', site, { code: 'AB12' }), `${site}/r/AB12`);
  assert.equal(linkFor('portal', site, {}), '');
  const v = varsFor({ first_name: ' Dana ', extra: { code: 'AB12', portal_token: 'tok' } }, { channel: 'email', body: '', button: 'affiliates' }, site);
  assert.equal(v['first name'], 'Dana');
  assert.equal(v.link, `${site}/affiliates`);
  assert.equal(v['affiliate link'], `${site}/r/AB12`);
  assert.equal(varsFor({ first_name: '' }, { channel: 'email', body: '' }, site)['first name'], 'there');
  assert.equal(fill('Hi [First Name] [unknown]', { 'first name': 'Dana' }), 'Hi Dana [unknown]');
});

test('texts say who they’re from and how to opt out', () => {
  const t = textMessage({ channel: 'text', body: 'Rates went up. Check yours: [link]' }, { link: 'https://x.co' });
  assert.equal(t, 'Cam Wiley Agency: Rates went up. Check yours: https://x.co Reply STOP to opt out.');
  assert.equal(textMessage({ channel: 'text', body: 'Cam Wiley here. Reply STOP to end.' }, {}), 'Cam Wiley here. Reply STOP to end.');
});

test('an email step renders in the shared layout with its button and unsubscribe link', () => {
  const site = 'https://insuredbycam.com';
  const step = drip.steps[0];
  const msg = renderEmail({ template: emailTemplate(step), saved: {}, vars: varsFor({ first_name: 'Dana' }, step, site), unsubscribeUrl: 'https://u.example/x' });
  assert.equal(msg.subject, 'Hi');
  assert.match(msg.html, /Hi Dana,/);
  assert.match(msg.html, /Check My Rate<\/a>/);
  assert.match(msg.html, /https:\/\/u\.example\/x/);
  assert.match(msg.text, /\?start=1/);
  const plain = emailTemplate({ channel: 'email', day: 0, subject: '', body: 'One.\n\n\nTwo.', button: 'none' });
  assert.deepEqual(plain.paragraphs, ['One.', 'Two.']);
  assert.equal(plain.button, undefined);
  assert.match(plain.subject, /Cam Wiley Agency/);
});
