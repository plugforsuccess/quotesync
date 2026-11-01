/* global Buffer */
// Partner portal (/partner/TOKEN): what a referral partner sees and does.
// The rate-check-partner edge function is mocked; the test checks what the page sends.
import { test, expect } from '@playwright/test';
import zlib from 'node:zlib';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const TOKEN = 'a'.repeat(48);
const CODE = 'JVN7K2QX';

// A small solid PNG (a stand-in headshot).
function png(w = 64, h = 64) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const thisMonth = new Date().toLocaleDateString('en-CA').slice(0, 7);
function portal(over = {}) {
  return {
    first_name: 'Javon', name: 'Javon Yarbrough', agency_name: 'Cam Wiley Agency, Inc.', active: true, code: CODE,
    agreement: { required: false, version: 'partner-v2', text: null, signed: false, signed_at: null },
    schedule: { auto_home: 45, auto_renters: 15, home_only: 15, auto_only: 10, renters_only: 2, extra_line: 5 }, monthly_cap: null,
    photo_url: null,
    w9: { on_file: false, tin_type: null, last4: null, signed_at: null, revision: 'Rev. March 2024', prefill: { address: '12 Oak St', city_state_zip: 'Covington, GA 30014' } },
    months: [],
    ...over,
  };
}

// Mocks the function; `state` changes as the partner saves things, like the real one.
async function mockPartner(page, state) {
  const calls = [];
  await page.route('**/functions/v1/rate-check-partner', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (body.token !== TOKEN) return json({ error: 'This link isn’t valid.' }, 404);
    if (body.mode === 'portal') return json(state.data);
    if (body.mode === 'w9') {
      state.data = { ...state.data, w9: { ...state.data.w9, on_file: true, tin_type: body.tin_type, last4: body.tin.slice(-4), signed_at: new Date().toISOString() } };
      return json({ w9: state.data.w9 });
    }
    if (body.mode === 'photo') { state.data = { ...state.data, photo_url: 'data:image/png;base64,' + png(8, 8).toString('base64') }; return json({ photo_url: state.data.photo_url }); }
    if (body.mode === 'photo_remove') { state.data = { ...state.data, photo_url: null }; return json({ photo_url: null }); }
    return json({ error: 'Unknown mode' }, 400);
  });
  return calls;
}

test('a new partner sees their live link and the two set-up steps', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mockPartner(page, { data: portal() });
  await page.goto(`/partner/${TOKEN}`);
  await expect(page.getByText('Your link is live')).toBeVisible();
  await expect(page.getByText(`/r/${CODE}`)).toBeVisible();
  await expect(page.getByText('Get set up · 2 steps')).toBeVisible();
  // The agreement is off for now: nothing to sign, the draft text isn't shown.
  await expect(page.getByLabel('Partner agreement')).toHaveCount(0);

  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`/r/${CODE}$`));
  // Step 1 is ticked off, and stays ticked off on the next visit.
  await expect(page.getByText('Share your link')).toHaveClass(/line-through/);
  await page.reload();
  await expect(page.getByText('Share your link')).toHaveClass(/line-through/);
});

test('signing the W-9: pre-filled, checked, sent once, then shown as on file', async ({ page }) => {
  const state = { data: portal() };
  const calls = await mockPartner(page, state);
  await page.goto(`/partner/${TOKEN}`);
  await page.getByRole('button', { name: 'Sign my W-9' }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign your W-9' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Name on your tax return')).toHaveValue('Javon Yarbrough');
  await expect(dialog.getByLabel('Street address')).toHaveValue('12 Oak St');
  await expect(dialog.getByLabel('City, state, ZIP')).toHaveValue('Covington, GA 30014');

  // Nothing typed yet: it explains what's missing and sends nothing.
  await dialog.getByRole('button', { name: 'Sign W-9' }).click();
  await expect(dialog.getByText('Fix the highlighted fields above.')).toBeVisible();
  await expect(dialog.getByText('Enter all 9 digits of your SSN.')).toBeVisible();
  expect(calls.filter(c => c.mode === 'w9')).toHaveLength(0);

  // A made-up number is caught on the page too.
  await dialog.getByLabel('Social Security number').fill('123456789');
  await dialog.getByRole('button', { name: 'Sign W-9' }).click();
  await expect(dialog.getByText('That doesn’t look like a real number.')).toBeVisible();

  await dialog.getByLabel('Social Security number').fill('412551234');
  await expect(dialog.getByLabel('Social Security number')).toHaveValue('412-55-1234');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Sign W-9' }).click();
  await expect(dialog).toHaveCount(0);

  const sent = calls.filter(c => c.mode === 'w9');
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    token: TOKEN, name: 'Javon Yarbrough', tax_class: 'individual', tin_type: 'ssn', tin: '412551234',
    address: '12 Oak St', city_state_zip: 'Covington, GA 30014', signed_name: 'Javon Yarbrough', accept: true,
  });
  // On file: the checklist is gone and only the last 4 show.
  await expect(page.getByText('Get set up · 2 steps')).toHaveCount(0);
  await expect(page.getByText('W-9 on file')).toBeVisible();
  await expect(page.getByText(/SSN ending 1234/)).toBeVisible();
  await expect(page.getByText('412-55-1234')).toHaveCount(0);
});

test('adding a photo needs the partner’s OK and sends a small JPEG', async ({ page }, testInfo) => {
  const file = testInfo.outputPath('me.png');
  (await import('node:fs')).writeFileSync(file, png(600, 800));
  const state = { data: portal() };
  const calls = await mockPartner(page, state);
  await page.goto(`/partner/${TOKEN}`);
  await page.locator('input[type=file][accept="image/*"]').setInputFiles(file);
  const use = page.getByRole('button', { name: 'Use this photo' });
  await expect(use).toBeDisabled();
  await page.getByRole('checkbox', { name: /Show this photo/ }).check();
  await use.click();
  await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();
  const sent = calls.find(c => c.mode === 'photo');
  expect(sent.consent).toBe(true);
  expect(sent.image).toMatch(/^data:image\/jpeg;base64,/);
  expect(Buffer.from(sent.image.split(',')[1], 'base64').length).toBeLessThan(1048576);

  await page.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByRole('button', { name: 'Add a photo' })).toBeVisible();
  expect(calls.some(c => c.mode === 'photo_remove')).toBe(true);
});

test('earnings: this month, past months, paid and unpaid', async ({ page }) => {
  const last = new Date(); last.setDate(1); last.setMonth(last.getMonth() - 1);
  const lastMonth = last.toLocaleDateString('en-CA').slice(0, 7);
  await mockPartner(page, { data: portal({
    w9: { on_file: true, tin_type: 'ssn', last4: '1234', signed_at: '2026-10-01T12:00:00Z', revision: 'Rev. March 2024', prefill: {} },
    months: [
      { month: thisMonth, households: 2, earned: 55, paid: null, rows: [
        { first_name: 'Stephen', label: 'Auto + home or condo', fee: 45, over_cap: false },
        { first_name: 'Ana', label: 'Auto only', fee: 10, over_cap: false }] },
      { month: lastMonth, households: 1, earned: 15, paid: { amount: 15, paid_at: '2026-10-05' }, rows: [
        { first_name: 'Lee', label: 'Auto + renters', fee: 15, over_cap: false }] },
    ],
  }) });
  await page.goto(`/partner/${TOKEN}`);
  await expect(page.getByText('Get set up · 2 steps')).toHaveCount(0);
  // No projections: unpaid months show a household count, paid months what was paid.
  await expect(page.getByText('2 households pending')).toBeVisible();
  await expect(page.getByText('Paid $15', { exact: true })).toBeVisible();
  await expect(page.getByText('Stephen')).toBeVisible();
  await expect(page.getByText('$45')).toHaveCount(0);
  await expect(page.getByText('$55')).toHaveCount(0);
});

test('a wrong or old link says so', async ({ page }) => {
  await mockPartner(page, { data: portal() });
  await page.goto(`/partner/${'b'.repeat(48)}`);
  await expect(page.getByText('This link isn’t valid.')).toBeVisible();
});

test('month headings say activity; a paused link says so', async ({ page }) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1);
  const nextMonth21 = `${d.toLocaleDateString('en-CA').slice(0, 7)}-21`;
  await mockPartner(page, { data: portal({
    active: false, pay_rule: 'reply',
    w9: { on_file: true, tin_type: 'ssn', last4: '1234', signed_at: '2026-10-01T12:00:00Z', revision: 'Rev. March 2024', prefill: {} },
    months: [{ month: thisMonth, households: 1, pending: 2, earned: 45, paid: null, pay_day: nextMonth21,
      rows: [{ first_name: 'Stephen', label: 'Auto + home or condo', fee: 45, over_cap: false }] }],
  }) });
  await page.goto(`/partner/${TOKEN}`);
  await expect(page.getByText(/Your link is paused/)).toBeVisible();
  await expect(page.getByText('3 households pending')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^[A-Z][a-z]+ \d{4} activity$/ })).toBeVisible();
  await expect(page.getByText('$45')).toHaveCount(0);
  await expect(page.getByText(/on the way/)).toHaveCount(0);
});
