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

async function mock(page, { loggedIn }) {
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
      if (req.method() === 'GET') return json([{ key: 'rc.headline', value: 'A **second look** at your insurance.' }]);
      writes.push({ method: req.method(), body: req.postDataJSON?.() ?? null, url: req.url() });
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
  await expect(page.getByRole('button', { name: 'Edit copy' })).toHaveCount(0);
});

test('a principal edits a line in place and it saves', async ({ page }) => {
  const writes = await mock(page, { loggedIn: true });
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit copy' }).click();
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
