import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceLabel, sendProgress, sendSteps, shortAgo, isFinal, formatPhoneInput, phoneDigits, validMobile } from '../../src/lib/quickSendFormat.js';

test('phone input formats as typed and validates a US mobile', () => {
  assert.equal(formatPhoneInput('404'), '404');
  assert.equal(formatPhoneInput('4045551'), '(404) 555-1');
  assert.equal(formatPhoneInput('+1 (404) 555-1212'), '(404) 555-1212');
  assert.equal(phoneDigits('1-404-555-1212'), '4045551212');
  assert.equal(validMobile('(404) 555-1212'), true);
  assert.equal(validMobile('(404) 155-1212'), false); // exchange can't start with 1
  assert.equal(validMobile('(104) 555-1212'), false);
  assert.equal(validMobile('404555121'), false);
});

test('a send shows its furthest step; carrier-accepted is not delivered', () => {
  const base = { expires_at: new Date(Date.now() + 86400000).toISOString(), upload_count: 0, opened_at: null };
  assert.equal(sendProgress({ ...base, sms_status: 'queued' }).label, 'Sending…');
  assert.equal(sendProgress({ ...base, sms_status: 'sent' }).label, 'Sent, waiting on their carrier');
  assert.equal(sendProgress({ ...base, sms_status: 'delivered' }).label, 'Delivered');
  assert.equal(sendProgress({ ...base, sms_status: 'failed' }).tone, 'bad');
  assert.equal(sendProgress({ ...base, sms_status: 'blocked' }).short, 'Opted out');
  assert.equal(sendProgress({ ...base, sms_status: 'delivered', opened_at: new Date().toISOString() }).label, 'Opened the link');
  assert.equal(sendProgress({ ...base, sms_status: 'delivered', upload_count: 1 }).label, 'Uploaded their policy');
  assert.equal(sendProgress({ ...base, sms_status: 'sent', expires_at: new Date(Date.now() - 1000).toISOString() }).label, 'Link expired');
  assert.equal(isFinal('sent'), false);
  assert.equal(isFinal('delivered'), true);
  assert.equal(isFinal('blocked'), true);
});

test('device labels tell set-up phones apart', () => {
  assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'), 'Android · Chrome');
  assert.equal(deviceLabel(''), 'Phone');
});

test('the four steps: sent, delivered, opened, uploaded; a failed text stops there', () => {
  assert.deepEqual(sendSteps({ sms_status: 'queued' }), { done: 0, stopped: false });
  assert.deepEqual(sendSteps({ sms_status: 'sent' }), { done: 1, stopped: false });
  assert.deepEqual(sendSteps({ sms_status: 'delivered' }), { done: 2, stopped: false });
  assert.deepEqual(sendSteps({ sms_status: 'delivered', opened_at: '2026-10-31T12:00:00Z' }), { done: 3, stopped: false });
  assert.deepEqual(sendSteps({ sms_status: 'delivered', upload_count: 1 }), { done: 4, stopped: false });
  assert.deepEqual(sendSteps({ sms_status: 'failed' }), { done: 0, stopped: true });
  const now = Date.parse('2026-10-31T12:00:00Z');
  assert.equal(shortAgo('2026-10-31T11:59:50Z', now), 'now');
  assert.equal(shortAgo('2026-10-31T11:15:00Z', now), '45m');
  assert.equal(shortAgo('2026-10-31T09:00:00Z', now), '3h');
});
