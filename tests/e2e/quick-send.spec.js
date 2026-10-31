// Quick Send (/qs): no QuoteSync login — a producer signs in with their Quick Send PIN, sends the upload
// link, and follows it to Delivered. The edge function is mocked; nothing is texted.
import { test, expect } from '@playwright/test';

function mockFunction(page, { blocked = false } = {}) {
  const calls = [];
  let polls = 0;
  const invite = (status) => ({
    id: 'inv-1', code: 'K7PM2QXD', producer_name: 'Cam Wiley', first_name: 'Keisha', phone: '4045551212',
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    opened_at: null, open_count: 0, upload_count: 0, sms_status: status,
    sms_error: blocked ? 'This number texted STOP' : null,
  });
  page.route('**/functions/v1/rate-check-quick-send', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (body.mode === 'pin') expect(body.remember).toBe(true);
    if (body.mode === 'pin') return body.pin === '1234' ? json({ device_key: 'k'.repeat(43), producer_first: 'Cam' }) : json({ error: 'That PIN didn’t work.' }, 401);
    if (body.mode === 'whoami') return json({ producer_first: 'Cam', enabled: true, pin: true });
    if (body.mode === 'recent') return json({ invites: calls.some(c => c.mode === 'send') ? [invite(blocked ? 'blocked' : 'delivered')] : [] });
    if (body.mode === 'send') {
      await new Promise(r => setTimeout(r, 300)); // long enough for a double tap
      return json({ invite: invite(blocked ? 'blocked' : 'queued'), link: 'https://insuredbycam.com/r/K7PM2QXD' });
    }
    if (body.mode === 'status') { polls += 1; return json({ invite: invite(polls > 1 ? 'delivered' : 'sent') }); }
    return json({ error: 'Unknown mode' }, 400);
  });
  return calls;
}

test('no login: PIN, name and number, one text, followed to Delivered', async ({ page }) => {
  const calls = mockFunction(page);
  await page.goto('/qs');
  await expect(page.getByRole('heading', { name: 'Quick Send' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Keep me signed in/ })).toBeChecked();
  await page.getByLabel('Your Quick Send PIN').fill('9999');
  await expect(page.getByRole('alert')).toHaveText('That PIN didn’t work.');
  await page.getByLabel('Your Quick Send PIN').fill('1234');

  const send = page.getByRole('button', { name: 'Send Requested DEC Link' });
  await expect(page.getByText(/operated by Cam Wiley Agency, Inc./)).toBeVisible();
  await expect(page.getByRole('checkbox')).toHaveCount(0); // never an opt-in here
  expect(await page.evaluate(() => localStorage.getItem('qs_quick_send_key'))).toBeTruthy(); // kept on this phone
  await expect(send).toBeDisabled();
  await page.getByLabel('Name', { exact: true }).fill('Keisha');
  await page.getByLabel('Mobile number').fill('4045551212');
  await expect(page.getByLabel('Mobile number')).toHaveValue('(404) 555-1212');
  await send.dblclick();

  await expect(page.getByText('Texted Keisha')).toBeVisible();
  await expect(page.getByRole('list', { name: /Progress: 2 of 4/ })).toBeVisible({ timeout: 15_000 });
  const sends = calls.filter(c => c.mode === 'send');
  expect(sends).toHaveLength(1);
  expect(sends[0]).toMatchObject({ first_name: 'Keisha', phone: '4045551212' });
  expect(sends[0].request_id).toMatch(/^[0-9a-f-]{36}$/);

  // Send another starts a fresh request.
  await page.getByRole('button', { name: 'Send another' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
});

test('a number that texted STOP is not texted; the link is offered instead', async ({ page }) => {
  mockFunction(page, { blocked: true });
  await page.goto('/qs');
  await page.getByLabel('Your Quick Send PIN').fill('1234');
  await page.getByLabel('Name', { exact: true }).fill('Keisha');
  await page.getByLabel('Mobile number').fill('4045551212');
  await page.getByRole('button', { name: 'Send Requested DEC Link' }).click();
  await expect(page.getByText('Keisha opted out of texts')).toBeVisible();
  // The code to scan comes up on its own when the text can't go.
  await expect(page.getByLabel('QR code for the upload link')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide QR code' })).toBeVisible();
});
