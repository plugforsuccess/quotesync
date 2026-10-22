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
function noisePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    for (let x = 0; x < w; x++) {
      const v = (Math.random() * 40 + 200) | 0;
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

test('downscales a 4 MB photo and shows the carrier confirmation', async ({ page }, testInfo) => {
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
  await expect(page.getByRole('heading', { name: 'Overpaying for insurance? Find out in 60 seconds.' })).toBeVisible();

  const submit = page.getByRole('button', { name: 'Check my rate' });
  await expect(submit).toBeDisabled();

  // Second file input = "or upload a photo / PDF" (the first one has capture=environment).
  await page.locator('input[type=file]').nth(1).setInputFiles(photoPath);
  await page.getByLabel('First name').fill('Keisha');
  await page.getByLabel('Mobile number').fill('4045551212');
  await expect(page.getByLabel('Mobile number')).toHaveValue('(404) 555-1212');
  await page.getByLabel('ZIP code').fill('30094');
  await expect(submit).toBeDisabled(); // consent still unchecked
  await page.getByRole('checkbox').check();

  const started = Date.now();
  await submit.click();
  await expect(page.getByText("Got it — we're checking your State Farm auto policy now.")).toBeVisible({ timeout: 15_000 });
  const elapsedMs = Date.now() - started;

  expect(posted).not.toBeNull();
  expect(posted.media_type).toBe('image/jpeg');
  const jpeg = Buffer.from(posted.image_base64, 'base64');
  const size = jpegSize(jpeg);
  expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(1600);
  expect(jpeg.length).toBeLessThan(photoBytes);
  expect(posted.phone).toBe('4045551212');
  expect(posted.zip).toBe('30094');
  expect(posted.consent_version).toBe('ratecheck-v1');
  expect(Date.parse(posted.consent_given_at)).not.toBeNaN();
  expect(posted.session_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(posted.landing_page).toBe('/ratecheck');
  expect(posted.utm_source).toBe('e2e');

  console.log(`[rate-check e2e] ${photoBytes} B PNG 2400x1800 -> ${jpeg.length} B JPEG ${size.width}x${size.height}; ` +
    `client prep + (mocked) round trip ${elapsedMs} ms`);
});
