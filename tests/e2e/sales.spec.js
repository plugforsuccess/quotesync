/* global Buffer */
// Quotes and binds on a lead (Producer Command Center, step 1): what the forms write.
// Supabase is mocked; the database's own rules (credit, bundle type, first renewal,
// lead status) are covered by the migration, not here.
import { test, expect } from '@playwright/test';

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } };
const lead = { id: 'L1', agency_id: AG, first_name: 'Dana', last_name: 'Reyes', phone: '6785550144', status: 'contacted', product_intent: 'auto', vehicle_count: 2, created_at: new Date().toISOString(), source: 'website' };

async function mock(page, state) {
  const writes = [];
  const rbac = { token: jwt, cachedAt: Date.now(), data: { profileData: { id: UID, email: user.email, full_name: 'Cam Wiley', role: 'agent', is_platform_user: false }, memberships: [membership], activeImpersonation: null } };
  await page.addInitScript(([s, c]) => {
    localStorage.setItem('sb-ghnpzllykteelveezhnv-auth-token', s);
    sessionStorage.setItem('qs_rbac_cache_v2', c);
    sessionStorage.setItem('qs_checklist_shown_v2', '1');
  }, [JSON.stringify(session), JSON.stringify(rbac)]);
  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/agency_memberships') return json(one ? membership : [membership]);
    if (p === '/rest/v1/leads') return json(one ? lead : [lead]);
    const t = p.replace('/rest/v1/', '');
    if (req.method() !== 'GET' && ['sales_quotes', 'sales_binds', 'bound_items'].includes(t)) {
      const body = req.postDataJSON();
      writes.push({ t, method: req.method(), body });
      if (t === 'sales_quotes' && req.method() === 'POST') state.quotes.unshift({ id: 'Q1', status: 'open', quoted_on: '2026-11-06', ...body });
      if (t === 'sales_quotes' && req.method() === 'PATCH') state.quotes.forEach(q => Object.assign(q, body));
      if (t === 'sales_binds') state.binds.unshift({ id: 'B1', bound_on: '2026-11-06', bound_items: [], ...body });
      const row = t === 'sales_binds' ? state.binds[0] : state.quotes[0];
      return json(one ? row : []);
    }
    if (t === 'sales_quotes') return json(state.quotes);
    if (t === 'sales_binds') return json(state.binds);
    return json(one ? null : []);
  });
  return writes;
}

test('log a quote with term premiums, then mark it bound with items and a bundle', async ({ page }) => {
  const state = { quotes: [], binds: [] };
  const writes = await mock(page, state);
  await page.goto('/agency/leads/L1');
  const card = page.locator('div').filter({ has: page.getByRole('heading', { name: /Quotes & binds/ }) }).last();
  await expect(card.getByRole('button', { name: 'Lost' })).toBeDisabled(); // nothing open yet

  await card.getByRole('button', { name: 'Quote', exact: true }).click();
  const q = page.getByRole('dialog', { name: 'Log a quote' });
  await expect(q.getByRole('button', { name: 'Pick what you quoted' })).toBeDisabled();
  await q.getByRole('button', { name: 'Auto' }).click();
  await q.getByRole('button', { name: 'Home' }).click();
  await q.getByLabel('Auto quoted premium').fill('912');
  await q.getByLabel('Home quoted premium').fill('1,480');
  await q.getByRole('button', { name: 'Save quote · 2 policies' }).click();
  await expect(q).toHaveCount(0);
  expect(writes[0]).toMatchObject({ t: 'sales_quotes', method: 'POST', body: {
    agency_id: AG, lead_id: 'L1', customer_name: 'Dana Reyes', products: ['auto', 'home'],
    lines: [{ product: 'auto', premium: 912, term_months: 6 }, { product: 'home', premium: 1480, term_months: 12 }],
  } });

  // Bound: prefilled from the open quote; auto items come from the 2 cars on the lead.
  await card.getByRole('button', { name: 'Bound', exact: true }).click();
  const b = page.getByRole('dialog', { name: 'Mark bound' });
  await expect(b.getByRole('radio', { name: 'Preferred bundle' })).toHaveAttribute('aria-checked', 'true');
  await b.getByLabel('Auto bound premium').fill('868');
  await b.getByLabel('Auto policy number').fill('804 123 456');
  await b.getByRole('button', { name: 'Save bind · 3 items' }).click();
  await expect(b).toHaveCount(0);
  const bind = writes.find(w => w.t === 'sales_binds');
  expect(bind.body).toMatchObject({ lead_id: 'L1', quote_id: 'Q1', bundle_type: 'preferred_bundle', bundle_type_overridden: false });
  expect(writes.find(w => w.t === 'bound_items').body).toEqual([
    expect.objectContaining({ product: 'auto', item_count: 2, premium: 868, term_months: 6, policy_number: '804 123 456' }),
    expect.objectContaining({ product: 'home', item_count: 1, premium: 1480, term_months: 12, policy_number: null }),
  ]);
  expect(writes.find(w => w.t === 'sales_quotes' && w.method === 'PATCH').body).toMatchObject({ status: 'bound' });
});

test('mark a quote lost with a reason', async ({ page }) => {
  const state = { quotes: [{ id: 'Q9', status: 'open', products: ['renters'], lines: [], quoted_on: '2026-11-01', quoted_premium: 180 }], binds: [] };
  const writes = await mock(page, state);
  await page.goto('/agency/leads/L1');
  const card = page.locator('div').filter({ has: page.getByRole('heading', { name: /Quotes & binds/ }) }).last();
  await card.getByRole('button', { name: 'Lost' }).click();
  const d = page.getByRole('dialog', { name: 'Mark lost' });
  await expect(d.getByRole('radio')).toHaveText([/Price/, /No response/, /Not eligible/]);
  await d.getByRole('radio', { name: /Price/ }).click();
  await d.getByRole('button', { name: 'Mark lost' }).click();
  await expect(d).toHaveCount(0);
  expect(writes[0]).toMatchObject({ t: 'sales_quotes', method: 'PATCH', body: { status: 'lost', lost_reason: 'price' } });
});
