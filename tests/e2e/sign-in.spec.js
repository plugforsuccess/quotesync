/* global Buffer */
// Sign In: after Supabase accepts the password, the app loads the profile and
// membership and leaves the sign-in page (it used to hang on the auth lock).
import { test, expect } from '@playwright/test';

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const UID = '11111111-2222-4333-8444-555555555555';
const AG = '00000000-0000-0000-0000-000000000001';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };

async function signIn(page, { frozenTab = false } = {}) {
  const asked = [];
  // A frozen background tab holding the cross-tab Web Lock Supabase used to use.
  if (frozenTab) await page.addInitScript(() => { navigator.locks?.request('lock:sb-ghnpzllykteelveezhnv-auth-token', () => new Promise(() => {})); });
  await page.route(`${SB}/**`, (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname;
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    asked.push(p);
    if (p === '/auth/v1/token') return json({ access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/profiles') { const prof = { id: UID, email: user.email, full_name: 'Cam Wiley', role: 'agent', platform_role: null, is_platform_user: false }; return json(one ? prof : [prof]); }
    if (p === '/rest/v1/agency_memberships') { const m = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } }; return json(one ? m : [m]); }
    return json(one ? null : []);
  });
  await page.goto('/admin-access-8by2X');
  await page.getByLabel('Email').fill('cam@example.com');
  await page.getByLabel('Password').fill('secret-pass');
  await page.getByRole('button', { name: 'Sign In' }).click();
  return asked;
}

test('Sign In finishes and leaves the sign-in page', async ({ page }) => {
  const asked = await signIn(page);
  await expect.poll(() => asked.includes('/rest/v1/profiles'), { timeout: 10000 }).toBe(true);
  await expect(page).not.toHaveURL(/admin-access/, { timeout: 10000 });
});

test('a frozen tab holding the old cross-tab lock does not slow sign-in', async ({ page }) => {
  const started = Date.now();
  await signIn(page, { frozenTab: true });
  await expect(page).not.toHaveURL(/admin-access/, { timeout: 10000 });
  expect(Date.now() - started).toBeLessThan(4000); // the old lock waited 5s per step
});
