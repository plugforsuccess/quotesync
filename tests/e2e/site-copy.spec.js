/* global Buffer */
// Copy editor: saved copy replaces the page's text for everyone; a logged-in principal
// can switch on "Edit copy", change a line in place, and it's saved. Supabase is mocked.
import { test, expect } from '@playwright/test';

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Agency', brand_name: 'insuredbycam' } };

async function mock(page, { loggedIn, failWrites = false, rows = [{ key: 'rc.headline', value: 'A **second look** at your insurance.' }], readDelay = 0 }) {
  const writes = [];
  if (loggedIn) {
    const rbac = { token: jwt, cachedAt: Date.now(), data: { profileData: { id: UID, email: user.email, full_name: 'Cam Wiley', role: 'agent', is_platform_user: false }, memberships: [membership], activeImpersonation: null } };
    await page.addInitScript(([s, c]) => {
      localStorage.setItem('sb-ghnpzllykteelveezhnv-auth-token', s);
      sessionStorage.setItem('qs_rbac_cache_v2', c);
    }, [JSON.stringify(session), JSON.stringify(rbac)]);
  }
  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/site_copy') {
      if (req.method() === 'GET') { if (readDelay) await new Promise(r => setTimeout(r, readDelay)); return json(rows); }
      writes.push({ method: req.method(), body: req.postDataJSON?.() ?? null, url: req.url() });
      if (failWrites) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ message: 'JWT expired' }) });
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    }
    if (p === '/rest/v1/agency_memberships') return json([membership]);
    return json([]);
  });
  return writes;
}

test('saved copy shows for visitors, with no edit button', async ({ page }) => {
  await mock(page, { loggedIn: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A second look at your insurance.' })).toBeVisible();
  await expect(page.locator('h1 b')).toHaveText('second look');
  await expect(page.getByRole('button', { name: 'Edit this page' })).toHaveCount(0);
});

test('a principal edits a line in place and it saves', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit this page' }).click();
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Free rate check/ });
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Free rate check · Statewide');
  await page.keyboard.press('Enter');
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ key: 'rc.eyebrow', value: 'Free rate check · Statewide' });

  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByText('Free rate check · Statewide')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Edit text/ })).toHaveCount(0);
});

test('edits confirm with "Saved"; pasted text loses its formatting; overlong lines are not saved', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/?edit=1');
  await expect(page.getByRole('button', { name: 'Done editing' })).toBeVisible(); // ?edit=1 turns editing on
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Free rate check/ });

  // Paste rich HTML: only its text goes in.
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<b style="color:red">Pasted</b> <a href="x">text</a>');
    dt.setData('text/plain', 'Pasted   text');
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(eyebrow.locator('b, a, span')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ key: 'rc.eyebrow', value: 'Pasted text' });
  await expect(page.getByText('Saved. It’s live.')).toBeVisible();

  // Far too long for this line: an explanation, no save, and Esc puts it back.
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('x'.repeat(200));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('this line fits');
  expect(writes).toHaveLength(1);
  await eyebrow.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a failed save says why in plain words', async ({ page }) => {
  await mock(page, { loggedIn: true, failWrites: true });
  await page.goto('/?edit=1');
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Free rate check/ });
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Free rate check · Statewide');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText('Your login expired. Log in again, then try that edit again.');
});

test('edited copy shows straight away on the next visit (no flash of the old text)', async ({ page }) => {
  await mock(page, { loggedIn: false, readDelay: 3000 });
  await page.addInitScript(() => localStorage.setItem('qs_site_copy_v1', JSON.stringify([{ key: 'rc.headline', value: 'Cached headline.' }])));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Cached headline.' })).toBeVisible({ timeout: 1500 });
});

test('logged out, ?edit=1 explains how to edit instead of doing nothing', async ({ page }) => {
  await mock(page, { loggedIn: false });
  await page.goto('/?edit=1');
  await expect(page.getByText(/To edit the website,/)).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Edit text/ })).toHaveCount(0);
});
