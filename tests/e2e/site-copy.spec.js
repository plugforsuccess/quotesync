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
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Products We Insure/ });
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Products we cover');
  await page.keyboard.press('Enter');
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].method).toBe('POST');
  expect(writes[0].body).toMatchObject({ key: 'rc.products.heading', value: 'Products we cover' });

  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(page.getByText('Products we cover')).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Edit text/ })).toHaveCount(0);
});

test('edits confirm with "Saved"; pasted text loses its formatting; overlong lines are not saved', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/?edit=1');
  await expect(page.getByRole('button', { name: 'Done editing' })).toBeVisible(); // ?edit=1 turns editing on
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Products We Insure/ });

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
  expect(writes[0].body).toMatchObject({ key: 'rc.products.heading', value: 'Pasted text' });
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
  const eyebrow = page.getByRole('textbox', { name: /Edit text: Products We Insure/ });
  await eyebrow.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Products we cover');
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

test('typing a space in a button label edits the text and does not press the button', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/?edit=1');
  let pickers = 0;
  page.on('filechooser', () => { pickers += 1; });
  const label = page.getByRole('textbox', { name: /Edit text: Check My Rate/ }).first();
  await label.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Upload my 2 policies');
  await expect(label).toHaveText('Upload my 2 policies');
  await page.keyboard.press('Enter');
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0].body).toMatchObject({ key: 'rc.start.cta', value: 'Upload my 2 policies' });
  await page.waitForTimeout(300);
  expect(pickers).toBe(0);
});

// On an iPhone, tapping blank space or the Done editing button doesn't take focus off the
// line, so blur never fires. The edit must still save: a moment after typing stops, and
// when edit mode closes.
test('an edit saves without tapping away: after a pause, and on Done editing', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit this page' }).click();
  const line = page.getByRole('textbox', { name: /Edit text: Products We Insure/ });
  await line.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' today');
  // No blur: it saves once typing stops.
  await expect.poll(() => writes.length, { timeout: 4000 }).toBe(1);
  expect(writes[0].body).toMatchObject({ key: 'rc.products.heading', value: 'Products We Insure today' });

  // Typed, then straight to Done editing, with focus never leaving the line.
  await line.click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.evaluate(() => {
    const done = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Done Editing'));
    done.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body).toMatchObject({ key: 'rc.products.heading', value: 'Products We Insure today!' });
});

// Every line a customer reads on the way through Rate Check can be edited. Walks the
// flow with the editor on and lists any visible text that isn't an editable line.
// Left out on purpose (data-copy="fixed"): the logo name, the editor's own controls, and the text-consent wording
// (fixed: it's versioned with each customer's recorded consent).
const notEditable = (page) => page.evaluate(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const t = w.currentNode.textContent.trim();
    const el = w.currentNode.parentElement;
    if (!/[A-Za-z]{2}/.test(t) || !el) continue;
    if (el.closest('[contenteditable], [data-copy="fixed"], script, style, [aria-hidden="true"], .sr-only, [class*="z-[90]"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) out.push(t);
  }
  return [...new Set(out)];
});

test('every screen of the upload flow can be edited', async ({ page }) => {
  await mock(page, { loggedIn: true });
  await page.route('**/functions/v1/rate-check', (route) => {
    const body = route.request().postDataJSON();
    if (body?.mode === 'classify') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ policy_type: 'home', confidence: 'high', expiration_date: '2025-01-01' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'received', rate_check_id: 'r1', carrier: 'GEICO', policy_type: 'home', annual_premium: 1400 }) });
  });
  const check = async (screen) => {
    await page.getByRole('button', { name: 'Edit this page' }).first().click();
    await expect(page.getByRole('button', { name: 'Done editing' })).toBeVisible();
    expect(await notEditable(page), `${screen}: text that can't be edited`).toEqual([]);
    await page.getByRole('button', { name: 'Done editing' }).click();
  };

  await page.goto('/');
  await check('landing');
  await page.goto('/?start=1');
  await check('pick');
  await page.getByRole('button', { name: 'Auto', exact: true }).click();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: /Continue · 2/ }).click();
  await check('upload');

  // A home policy in the Auto slot that already ended: the moved card, then the expired one.
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Upload', exact: true }).first().click()]);
  await chooser.setFiles({ name: 'dec.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await expect(page.getByText(/This file is/)).toBeVisible();
  await check('moved card');
  await page.getByRole('button', { name: 'Got It' }).click();
  await check('expired card');
  await page.getByRole('button', { name: 'It’s Current' }).click();
  await page.getByRole('button', { name: /Continue With What I Have/ }).click();

  await check('contact');
  await page.getByLabel('First Name').fill('Dana');
  await page.getByLabel('Last Name').fill('Reyes');
  await page.getByLabel('Mobile Number').fill('4045551212');
  await page.getByLabel('Email').fill('dana@example.com');
  await page.getByLabel('ZIP Code').fill('30013'); // the policy didn't show one
  await page.getByRole('button', { name: 'Check My Rate' }).click();
  await page.getByRole('button', { name: /No Thanks/ }).click();
  await expect(page.getByRole('heading', { name: /Cam is on it/ })).toBeVisible({ timeout: 15000 });
  await check('confirmation');
});
