// tests/e2e/rate-check.spec.js
// Public Rate Check page (/ratecheck) on a phone-width viewport.
// The rate-check edge function call is intercepted so this runs without
// network access to Supabase; it asserts what the page actually posts
// (a ~4 MB photo must be downscaled to a JPEG ≤ 1600px long edge) and that
// the confirmation uses the returned carrier / policy type.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import zlib from 'node:zlib';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// Minimal truecolor PNG encoder: grey noise so the file stays ~4 MB like a real photo.
function noisePng(w, h, { base = 200, spread = 40 } = {}) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const v = (Math.random() * spread + base) | 0;
      raw[row + 1 + x * 3] = v; raw[row + 2 + x * 3] = v; raw[row + 3 + x * 3] = v;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Width/height from a baseline/progressive JPEG's SOF marker.
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

async function fillContact(page) {
  // The code is texted by rate-check-otp; here it answers "sent" and accepts any code.
  await page.route('**/functions/v1/rate-check-otp', async (route) => {
    const body = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body.mode === 'send' ? { sent: true } : { verified: true }) });
  });
  await page.getByLabel('First name').fill('Keisha');
  await page.getByLabel('Mobile number').fill('4045551212');
  await expect(page.getByLabel('Mobile number')).toHaveValue('(404) 555-1212');
  // Only when the build has VITE_RATE_CHECK_OTP=true.
  const textMe = page.getByRole('button', { name: 'Text me a code' });
  if (await textMe.isVisible()) {
    await textMe.click();
    await page.getByLabel(/Enter the 6-digit code/).fill('123456');
    await expect(page.getByRole('status')).toHaveText(/Number verified/);
  }
  await page.getByLabel('Email').fill('keisha@example.com');
  await page.getByLabel('ZIP code').fill('30094');
  await page.getByLabel('Where do you live?').selectOption('own');
}

test('downscales a 4 MB photo and shows what it read', async ({ page }, testInfo) => {
  const photoPath = testInfo.outputPath('dec-page-photo.png');
  fs.writeFileSync(photoPath, noisePng(2400, 1800));
  const photoBytes = fs.statSync(photoPath).size;
  expect(photoBytes).toBeGreaterThan(4 * 1024 * 1024);

  let posted = null;
  await page.route('**/functions/v1/rate-check', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'received', rate_check_id: 'test', carrier: 'State Farm', policy_type: 'auto', annual_premium: 1560 }),
    });
  });

  await page.goto('/ratecheck?utm_source=e2e&utm_campaign=ratecheck-qa');
  await expect(page.getByRole('heading', { name: 'Get a second opinion on your insurance.' })).toBeVisible();

  await page.getByTestId('rc-files').setInputFiles(photoPath);
  await expect(page.getByText('1 page', { exact: true })).toBeVisible();
  await expect(page.getByText('Does this policy have more pages?')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();

  await expect(page.getByRole('heading', { name: 'How can Cam reach you?' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Check my rate' });
  await expect(submit).toBeDisabled();
  await fillContact(page);
  // Both boxes are optional and start unchecked: automated texts first, partner referral second.
  await expect(page.getByRole('checkbox').nth(0)).not.toBeChecked();
  await expect(submit).toBeEnabled();
  await page.getByRole('checkbox').nth(0).check();
  await expect(page.getByRole('checkbox').nth(1)).not.toBeChecked();

  const started = Date.now();
  await submit.click();
  await expect(page.getByRole('heading', { name: 'Got it — Cam is on it.' })).toBeVisible({ timeout: 15_000 });
  const elapsedMs = Date.now() - started;
  await expect(page.getByText('State Farm', { exact: true })).toBeVisible();
  await expect(page.getByText('Auto · $1,560/yr')).toBeVisible();
  await expect(page.getByTestId('rc-total')).toHaveText('$1,560'); // "You pay today" total

  expect(posted).not.toBeNull();
  expect(posted.media_type).toBe('image/jpeg');
  const jpeg = Buffer.from(posted.image_base64, 'base64');
  const size = jpegSize(jpeg);
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1600);
  expect(jpeg.length).toBeLessThan(photoBytes);
  expect(posted.phone).toBe('4045551212');
  expect(posted.zip).toBe('30094');
  expect(posted.email).toBe('keisha@example.com');
  expect(posted.housing_situation).toBe('own');
  expect(posted.consent_version).toBe('ratecheck-v2');
  expect(posted.sms_consent).toBe('opted_in');
  expect(Date.parse(posted.consent_given_at)).not.toBeNaN();
  expect(posted.session_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(posted.landing_page).toBe('/ratecheck');
  expect(posted.utm_source).toBe('e2e');
  expect(posted.referral_consent_given_at).toBeUndefined(); // opt-in only

  console.log(`[rate-check e2e] ${photoBytes} B PNG 2400x1800 -> ${jpeg.length} B JPEG ${size.width}x${size.height}; ` +
    `client prep + (mocked) round trip ${elapsedMs} ms`);
});

test('a household sends any number of policies, retries a throttled one, and adds more later', async ({ page }, testInfo) => {
  const files = ['auto', 'home', 'boat', 'truck'].map(n => {
    const f = testInfo.outputPath(`${n}.png`); fs.writeFileSync(f, noisePng(800, 600)); return f;
  });
  const replies = [
    { carrier: 'State Farm', policy_type: 'auto', annual_premium: 1560 },
    { carrier: 'Progressive', policy_type: 'home', annual_premium: 2013 },
    { carrier: 'Other', policy_type: 'other', annual_premium: 427 },
    { carrier: 'GEICO', policy_type: 'auto', annual_premium: 980 },
  ];
  const posts = [];
  let throttledOnce = false;
  await page.route('**/functions/v1/rate-check', async (route) => {
    if (posts.length === 1 && !throttledOnce) {
      throttledOnce = true; // the page should wait and retry this one
      return route.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Rate limit exceeded"}' });
    }
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'received', rate_check_id: `t${posts.length}`, ...replies[posts.length - 1] }) });
  });
  await page.clock.install();

  await page.goto('/ratecheck');
  await page.getByTestId('rc-files').setInputFiles([files[0], files[1]]);
  await page.getByRole('button', { name: '2 separate policies' }).click();
  await expect(page.getByText('2 added')).toBeVisible();
  await page.getByTestId('rc-files').setInputFiles(files[0]); // duplicate
  await expect(page.getByText('You already added that one.')).toBeVisible();
  await page.getByTestId('rc-files').setInputFiles(files[2]);
  await expect(page.getByText('3 added')).toBeVisible();
  await page.getByRole('button', { name: 'Remove policy 3' }).click();
  await expect(page.getByText('2 added')).toBeVisible();
  await page.getByTestId('rc-files').setInputFiles(files[2]);
  await page.getByRole('button', { name: /Continue/ }).click();

  await fillContact(page);
  // Leave the optional text box unchecked: the policies still go through.
  await page.getByRole('button', { name: 'Check my 3 policies' }).click();

  await expect(page.getByRole('heading', { name: 'Reading your policies…' })).toBeVisible();
  await expect(page.getByText('State Farm', { exact: true })).toBeVisible({ timeout: 15_000 });
  // The throttled request waits 20 s before retrying. Keep advancing the fake clock
  // until it finishes: one big jump can land before the page has started that wait
  // (under load), and then the retry never fires.
  const done = page.getByRole('heading', { name: 'Got it — Cam is on it.' });
  await expect.poll(async () => { await page.clock.runFor(5_000); return done.isVisible(); }, { timeout: 15_000 }).toBe(true);
  await expect(page.getByText('Home · $2,013/yr')).toBeVisible();
  await expect(page.getByText('Policy read')).toBeVisible();
  await expect(page.getByTestId('rc-total')).toHaveText('$4,000');
  expect(posts).toHaveLength(3);
  expect(new Set(posts.map(p => p.session_id)).size).toBe(1);
  expect(posts.every(p => p.consent_given_at === undefined && p.sms_consent === 'declined')).toBe(true);

  // Add one more later: no second contact step, same (declined) choice.
  await page.getByRole('button', { name: 'Add more policies' }).click();
  await expect(page.getByText('3 policies already sent.')).toBeVisible();
  await page.getByTestId('rc-files').setInputFiles(files[3]);
  await page.getByRole('button', { name: /Send it/ }).click();
  await expect(page.getByText('Auto · $980/yr')).toBeVisible({ timeout: 15_000 });
  expect(posts).toHaveLength(4);
  expect(posts[3].sms_consent).toBe('declined');
  await expect(page.getByTestId('rc-total')).toHaveText('$4,980');

  // Reloading the tab keeps what was sent; "Start over" wipes it.
  await page.reload();
  await expect(page.getByText('Auto · $980/yr')).toBeVisible();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('heading', { name: 'Get a second opinion on your insurance.' })).toBeVisible();
});

test('saves progress on the device and warns about dark or blurry photos', async ({ page }, testInfo) => {
  const dark = testInfo.outputPath('dark.png'); fs.writeFileSync(dark, noisePng(600, 800, { base: 20, spread: 10 }));
  const flat = testInfo.outputPath('flat.png'); fs.writeFileSync(flat, noisePng(600, 800, { base: 210, spread: 1 }));
  await page.route('**/functions/v1/rate-check', route => route.abort());

  await page.goto('/ratecheck');
  await page.getByTestId('rc-files').setInputFiles([dark, flat]);
  await page.getByRole('button', { name: '2 separate policies' }).click();
  await expect(page.getByText('Page 1 looks too dark')).toBeVisible();
  await expect(page.getByText('Page 1 looks blurry')).toBeVisible();
  await expect(page.getByText('Blurry or dark? Retake that page, or send anyway.')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('First name').fill('Dre');

  // Leave and come back: photos and typed details are still there; consent is not.
  await page.reload();
  await expect(page.getByText('Welcome back — we kept your progress.')).toBeVisible();
  await expect(page.getByText('2 added')).toBeVisible();
  await page.getByRole('button', { name: /Continue/ }).click();
  await expect(page.getByLabel('First name')).toHaveValue('Dre');
  await expect(page.getByRole('checkbox').nth(0)).not.toBeChecked();

  await page.getByRole('button', { name: '2 policies', exact: true }).click();
  await page.getByRole('button', { name: 'Start over' }).click();
  await expect(page.getByRole('heading', { name: 'Get a second opinion on your insurance.' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Welcome back')).toHaveCount(0);
});

test('a policy with several pages goes up as one PDF, and asks about more pages', async ({ page }, testInfo) => {
  const [p1, p2, p3] = ['p1', 'p2', 'p3'].map(n => {
    const f = testInfo.outputPath(`${n}.png`); fs.writeFileSync(f, noisePng(900, 1200)); return f;
  });
  const posts = [];
  await page.route('**/functions/v1/rate-check', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'received', rate_check_id: 't1', carrier: 'State Farm', policy_type: 'auto', annual_premium: 1560 }) });
  });

  await page.goto('/ratecheck');
  // One photo: it asks whether the policy has more pages.
  await page.getByTestId('rc-files').setInputFiles(p1);
  await expect(page.getByText('Does this policy have more pages?')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add page 2' }).first().click();
  await (await chooser).setFiles(p2);
  await expect(page.getByText('2 pages', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add page 3' }).first()).toBeVisible();
  await page.getByRole('button', { name: "That's all" }).click();
  await expect(page.getByText('Does this policy have more pages?')).toHaveCount(0);

  // A new photo from the main buttons starts a new policy.
  await page.getByTestId('rc-files').setInputFiles([p3]);
  await expect(page.getByText('2 added')).toBeVisible();
  await page.getByRole('button', { name: 'Remove policy 2' }).click();

  // Pages survive a reload, in order.
  await page.reload();
  await expect(page.getByText('2 pages', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Continue/ }).click();
  await fillContact(page);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('button', { name: 'Check my rate' }).click();
  await expect(page.getByRole('heading', { name: 'Got it — Cam is on it.' })).toBeVisible({ timeout: 15_000 });

  expect(posts).toHaveLength(1);
  expect(posts[0].media_type).toBe('application/pdf');
  const pdf = Buffer.from(posts[0].image_base64, 'base64');
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const { PDFDocument } = await import('pdf-lib');
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
});

test('a downloaded PDF counts its own pages and goes up whole', async ({ page }, testInfo) => {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  for (let i = 0; i < 3; i++) doc.addPage([612, 792]).drawText(`State Farm auto, page ${i + 1}`, { x: 50, y: 700 });
  const file = testInfo.outputPath('statefarm-auto.pdf');
  fs.writeFileSync(file, await doc.save());
  const posts = [];
  await page.route('**/functions/v1/rate-check', async (route) => {
    posts.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ status: 'received', rate_check_id: 't1', carrier: 'State Farm', policy_type: 'auto', annual_premium: 1560 }) });
  });

  await page.goto('/ratecheck');
  await page.getByTestId('rc-files').setInputFiles(file);
  await expect(page.getByText('PDF · 3 pages', { exact: true })).toBeVisible();
  await expect(page.getByText('1 added')).toBeVisible();
  // The PDF is the whole policy: no "more pages?" nudge and no add-page tile.
  await expect(page.getByText('Does this policy have more pages?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Add page/ })).toHaveCount(0);

  // Still counted after a reload (restored from the device draft).
  await page.reload();
  await expect(page.getByText('PDF · 3 pages', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Continue/ }).click();
  await fillContact(page);
  await page.getByRole('checkbox').nth(0).check();
  await page.getByRole('button', { name: 'Check my rate' }).click();
  await expect(page.getByRole('heading', { name: 'Got it — Cam is on it.' })).toBeVisible({ timeout: 15_000 });

  expect(posts).toHaveLength(1);
  expect(posts[0].media_type).toBe('application/pdf');
  const sent = await PDFDocument.load(Buffer.from(posts[0].image_base64, 'base64'));
  expect(sent.getPageCount()).toBe(3);
});
