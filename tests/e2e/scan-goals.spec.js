/* global Buffer */
// Scans & Quotes: the Today strip on the Rate Checks inbox, the Goals tab, a walk-in
// quote logged without a lead, and the shared read-only report. Supabase is mocked.
import { test, expect } from '@playwright/test';

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } };

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const ago = (n) => { const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const goals = {
  today, from: ago(34), is_manager: true, me: UID, goal_scans: 8.5, goal_people: 8,
  scans: [
    { day: today, source: 'affiliate', user_id: null, n: 2 },
    { day: today, source: 'staff', user_id: UID, n: 1 },
    { day: ago(1), source: 'quick_send', user_id: 'logan', n: 4 },
    { day: ago(2), source: 'website', user_id: null, n: 9 },
    { day: ago(3), source: 'link', user_id: UID, n: 6 },
  ],
  quotes: [
    { day: today, user_id: UID, people: 5, policies: 7, with_scan: 3 },
    { day: today, user_id: 'logan', people: 8, policies: 11, with_scan: 2 },
    { day: ago(1), user_id: 'logan', people: 9, policies: 12, with_scan: 5 },
  ],
  team_quotes: [{ day: today, people: 13, policies: 18, with_scan: 5 }, { day: ago(1), people: 9, policies: 12, with_scan: 5 }],
  team: [{ user_id: UID, name: 'Cam Wiley', role: 'principal' }, { user_id: 'logan', name: 'Logan Reed', role: 'employee' }],
};
const report = {
  agency: 'Cam Wiley Agency', today, from: ago(29), goal_scans: 8.5, goal_people: 8, team: 2,
  scans: goals.scans.map(({ user_id: _u, ...s }) => s),
  quotes: goals.team_quotes,
  binds: [{ day: ago(1), n: 2 }],
};

async function mock(page) {
  const writes = [];
  const rbac = { token: jwt, cachedAt: Date.now(), data: { profileData: { id: UID, email: user.email, full_name: 'Cam Wiley', role: 'agent', is_platform_user: false }, memberships: [membership], activeImpersonation: null } };
  await page.addInitScript(([s, c]) => {
    localStorage.setItem('sb-ghnpzllykteelveezhnv-auth-token', s);
    sessionStorage.setItem('qs_rbac_cache_v2', c);
    sessionStorage.setItem('qs_checklist_shown_v2', '1');
  }, [JSON.stringify(session), JSON.stringify(rbac)]);
  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/rpc/scan_goals') return json(goals);
    if (p === '/rest/v1/rpc/scan_report') return json(req.postDataJSON()?.p_token === 'f'.repeat(36) ? report : null);
    if (p === '/rest/v1/agency_memberships') return json(one ? membership : [membership]);
    if (p === '/rest/v1/feature_permissions') return json([{ feature_key: 'rate_checks', enabled: true }]);
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      writes.push({ table: p.replace('/rest/v1/', ''), method: req.method(), body: req.postDataJSON?.() ?? null });
      if (p === '/rest/v1/scan_report_links') return json({ id: 'l1', token: 'f'.repeat(36), label: 'Allstate', created_at: new Date().toISOString() }, 201);
      return route.fulfill({ status: 201, contentType: 'application/json', body: one ? '{"id":"q1"}' : '[]' });
    }
    return one ? json(null) : json([]);
  });
  return writes;
}

test('the inbox shows today’s scans and the producer’s quotes against the goals', async ({ page }) => {
  await mock(page);
  await page.goto('/agency/leads/rate-checks');
  const strip = page.getByRole('region', { name: 'Today' });
  await expect(strip.getByRole('button', { name: /Scans Today\s*3\s*of 8\.5/ })).toBeVisible();
  await expect(strip.getByRole('button', { name: /You Quoted\s*5\s*of 8 People/ })).toBeVisible();
  await expect(strip.getByText('7 policies · 3 with a scan')).toBeVisible();
});

test('Save a Quote saves a walk-in without a lead', async ({ page }) => {
  const writes = await mock(page);
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('button', { name: 'Save a Quote' }).click();
  const sheet = page.getByRole('dialog', { name: 'Save a Quote' });
  await sheet.getByLabel('Customer name').fill('Maria Lopez');
  await sheet.getByRole('button', { name: 'Auto' }).click();
  await sheet.getByRole('button', { name: 'Home' }).click();
  await sheet.getByRole('button', { name: /Save Quote · 2 Policies/ }).click();
  await expect.poll(() => writes.find(w => w.table === 'sales_quotes')?.body).toMatchObject({
    agency_id: AG, lead_id: null, customer_name: 'Maria Lopez', products: ['auto', 'home'],
  });
});

test('Scan for Customer opens the staff upload', async ({ page }) => {
  await mock(page);
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('button', { name: 'Scan for Customer' }).click();
  await expect(page.getByRole('dialog', { name: 'Upload dec page' })).toBeVisible();
});

test('the Scans & Quotes tab: pace, sources, team and a shared report link', async ({ page }) => {
  const writes = await mock(page);
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('button', { name: /Scans Today/ }).click();
  await expect(page.getByRole('heading', { name: 'Scans & Quotes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Last 14 Days' })).toBeVisible();
  const team = page.getByRole('region', { name: 'People Quoted' });
  await expect(team.getByText('Logan Reed')).toBeVisible();
  await expect(team.getByText('Cam Wiley')).toBeVisible();
  await page.getByLabel('Quotes A Day (Each)').fill('10');
  await page.getByRole('button', { name: 'Save Goals' }).click();
  await expect.poll(() => writes.find(w => w.table.startsWith('producer_floor_settings'))?.body).toMatchObject({ agency_id: AG, scans_goal_daily: 8.5, quotes_floor: 10 });
  await page.getByLabel('Who the link is for').fill('Allstate');
  await page.getByRole('button', { name: 'Make Link' }).click();
  await expect.poll(() => writes.find(w => w.table === 'scan_report_links')?.body).toMatchObject({ agency_id: AG, label: 'Allstate' });
});

test('the shared report shows team totals, and a bad link says so', async ({ page }) => {
  await mock(page);
  await page.goto(`/report/${'f'.repeat(36)}`);
  await expect(page.getByRole('heading', { name: 'Scans & Quotes' })).toBeVisible();
  await expect(page.getByText('Cam Wiley Agency')).toBeVisible();
  await expect(page.getByText('Logan Reed')).toHaveCount(0);
  await page.goto(`/report/${'0'.repeat(36)}`);
  await expect(page.getByRole('heading', { name: 'This Report Isn’t Available' })).toBeVisible();
});
