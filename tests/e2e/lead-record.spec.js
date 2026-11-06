/* global Buffer */
// The lead record is the sales workspace: a winback (no upload) gets the same steps, and
// a lead with uploads opens its Rate Check workspace. Supabase is mocked; checks writes.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const PID = '22222222-3333-4444-8555-666666666666';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } };

const today = new Date();
const iso = (daysAgo) => new Date(today.getTime() - daysAgo * 86400000).toISOString();
const partner = (over = {}) => ({
  id: PID, agency_id: AG, name: 'Javon Yarbrough', phone: '4045550123', email: 'javon@example.com', code: 'JVN7K2QX',
  portal_token: 'a'.repeat(48), active: true, monthly_cap: null, photo_url: null, photo_consent_at: null,
  agreement_signed_at: null, agreement_version: null, w9_received_at: iso(20), w9_tin_type: 'ssn', w9_tin_last4: '1234', w9_pdf_path: null,
  mailing_address: null, mailing_city_state_zip: null, created_at: iso(30), ...over,
});
// Two households this month: Stephen sent auto + home and replied Y; Ana sent auto, was quoted, never texted.
// Two months back is always past its pay day (the 21st of the following month).
const twoMonthsAgo = () => { const d = new Date(); d.setDate(5); d.setMonth(d.getMonth() - 2); d.setHours(15, 0, 0, 0); return d.toISOString(); };
const makeScans = (at) => scansAt(at);
const scansAt = (at) => [
  { id: 'r1', promoter_id: PID, phone: '4045550001', first_name: 'Stephen', policy_type: 'auto', carrier: 'State Farm', status: 'won', duplicate_of: null, created_at: at, annual_premium: 2400, allstate_premium: 2000, bound_premium: 2000, quoted_at: at, expiration_date: null, insured_address: '1 Main St Covington GA', policy_number: 'SF123456', quote_ready_texted_at: at, call_confirmed_at: at },
  { id: 'r2', promoter_id: PID, phone: '4045550001', first_name: 'Stephen', policy_type: 'home', carrier: 'State Farm', status: 'won', duplicate_of: null, created_at: at, annual_premium: 1800, allstate_premium: 1500, bound_premium: null, quoted_at: at, expiration_date: null, insured_address: '1 Main St Covington GA', policy_number: 'SF654321', quote_ready_texted_at: at, call_confirmed_at: at },
  { id: 'r3', promoter_id: PID, phone: '4045550002', first_name: 'Ana', policy_type: 'auto', carrier: 'GEICO', status: 'quoted', duplicate_of: null, created_at: at, annual_premium: 1500, allstate_premium: 1300, bound_premium: null, quoted_at: at, expiration_date: null, insured_address: '9 Elm St Atlanta GA', policy_number: 'GE998877', quote_ready_texted_at: null, call_confirmed_at: null },
];

async function mock(page, state) {
  const writes = [];
  const rbac = { token: jwt, cachedAt: Date.now(), data: { profileData: { id: UID, email: user.email, full_name: 'Cam Wiley', role: 'agent', is_platform_user: false }, memberships: [membership], activeImpersonation: null } };
  await page.addInitScript(([s, c]) => {
    localStorage.setItem('sb-ghnpzllykteelveezhnv-auth-token', s);
    sessionStorage.setItem('qs_rbac_cache_v2', c);
    sessionStorage.setItem('qs_checklist_shown_v2', '1'); // skip the daily report-checklist pop-up
  }, [JSON.stringify(session), JSON.stringify(rbac)]);
  await page.route(`${SB}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (p.startsWith('/auth/v1/user')) return json(user);
    if (p === '/rest/v1/agency_memberships' && (url.searchParams.get('select') || '').includes('recruit_code')) {
      return json([{ user_id: UID, agency_role: 'principal', status: 'active', recruit_code: 'CAMREC01' },
        { user_id: 'amy', agency_role: 'producer', status: 'active', recruit_code: 'AMYREC01' }]);
    }
    // Names come from profiles, looked up by id (memberships don't link to profiles).
    if (p === '/rest/v1/profiles' && (url.searchParams.get('id') || '').startsWith('in.')) {
      return json([{ id: UID, full_name: 'Cam Wiley', email: user.email }, { id: 'amy', full_name: 'Amy Producer', email: 'amy@example.com' }]);
    }
    if (p === '/rest/v1/producer_floor_settings') return json(one ? { agency_id: AG, partners_floor: 2 } : [{ agency_id: AG, partners_floor: 2 }]);
    if (p === '/rest/v1/agency_memberships') return json(one ? membership : [membership]);
    if (p === '/rest/v1/feature_permissions') return json([{ feature_key: 'rate_checks', enabled: true }]);
    if (req.method() !== 'GET' && req.method() !== 'HEAD') {
      const body = req.postDataJSON?.() ?? null;
      writes.push({ table: p.replace('/rest/v1/', ''), method: req.method(), body, query: url.search });
      if (p === '/rest/v1/rate_check_partner_rules') state.rules = Array.isArray(body) ? body[0] : body;
      if (p === '/rest/v1/rate_check_promoter_payouts' && req.method() === 'POST') state.payouts = body.map(r => ({ id: 'pay1', ...r }));
      if (p === '/rest/v1/rate_check_promoters' && req.method() === 'POST') state.partners = [...state.partners, partner({ id: 'new', name: body.name, phone: body.phone, code: 'NEWCODE1', w9_received_at: null })];
      return route.fulfill({ status: 201, contentType: 'application/json', body: one ? '{}' : '[]' });
    }
    if (p === '/rest/v1/rate_check_promoters') return json(state.partners);
    if (p === '/rest/v1/rate_checks' && url.searchParams.get('promoter_id') === 'not.is.null') return json(state.scans || makeScans(iso(0)));
    if (p === '/rest/v1/rate_check_partner_rules') return one ? (state.rules ? json(state.rules) : json(null)) : json(state.rules ? [state.rules] : []);
    if (p === '/rest/v1/rate_check_promoter_payouts') return json(state.payouts);
    return one ? json(null) : json([]);
  });
  return writes;
}



const winback = { id: 'W1', agency_id: AG, first_name: 'LEE', last_name: 'MORGAN', phone: '4045550142', email: 'lee@example.com', zip: '30014', state: 'GA',
  source: 'winback', status: 'new', created_at: iso(40), consent_given_at: null, vehicle_count: 2,
  callback_note: 'Winback: lost auto 01/2026 — Insured Request — $3156', referred_by: null, lead_quotes: [] };

async function openLead(page, { lead = winback, rcs = [], quotes = [] } = {}) {
  const writes = await mock(page, { partners: [], rules: null, payouts: [] });
  const state = { quotes };
  await page.route(SB + '/rest/v1/leads*', (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') { writes.push({ table: 'leads', body: req.postDataJSON() }); return route.fulfill({ status: 204, body: '' }); }
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? lead : [lead]) });
  });
  await page.route(SB + '/rest/v1/rate_checks*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rcs) }));
  await page.route(SB + '/rest/v1/sales_quotes*', (route) => {
    const req = route.request();
    if (req.method() === 'POST') {
      const body = req.postDataJSON(); writes.push({ table: 'sales_quotes', method: 'POST', body });
      state.quotes = [{ id: 'Q9', status: 'open', ...body }];
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(state.quotes[0]) });
    }
    if (req.method() === 'PATCH') { writes.push({ table: 'sales_quotes', method: 'PATCH', body: req.postDataJSON() }); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.quotes.filter(q => q.status === 'open').map(q => ({ id: q.id }))) }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.quotes) });
  });
  await page.route(SB + '/rest/v1/sales_binds*', (route) => {
    const req = route.request();
    if (req.method() === 'POST') { writes.push({ table: 'sales_binds', body: req.postDataJSON() }); return route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"B1"}' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route(SB + '/rest/v1/bound_items*', (route) => {
    writes.push({ table: 'bound_items', body: route.request().postDataJSON() });
    return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
  });
  await page.goto(`/agency/leads/${lead.id}`);
  return writes;
}

test('a winback lead record is the workspace: review, save the quote by product, close bound', async ({ page }) => {
  const writes = await openLead(page);
  const dialog = page.getByRole('dialog', { name: 'Sales workspace' });
  await expect(dialog.getByRole('heading', { name: 'Lee Morgan' })).toBeVisible();
  await expect(dialog.getByText('Former Customer', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Auto · 01/2026')).toBeVisible();
  await expect(dialog.getByText('Insured Request')).toBeVisible();

  await dialog.getByRole('button', { name: /Save the Quote/ }).click();
  await expect(dialog.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute('aria-pressed', 'true'); // what they left
  await dialog.getByLabel('Auto Allstate rate').fill('1450');
  await dialog.getByRole('button', { name: 'Home', exact: true }).click();
  await dialog.getByLabel('Home Allstate rate').fill('1200');
  await expect(dialog.getByText('$4,100')).toBeVisible(); // 1450 × 2 + 1200
  await dialog.getByRole('button', { name: 'Save Quote' }).click();
  await expect(dialog.getByText('Quote Saved')).toBeVisible();
  const quote = writes.find(w => w.table === 'sales_quotes' && w.method === 'POST').body;
  expect(quote).toMatchObject({ lead_id: 'W1', products: ['auto', 'home'], lines: [{ product: 'auto', premium: 1450, term_months: 6 }, { product: 'home', premium: 1200, term_months: 12 }] });

  // No text consent on a winback: the words become a call script.
  await dialog.getByRole('button', { name: /Next: Contact Them/ }).click();
  await expect(dialog.getByText('What to Say')).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveValue(/new Allstate quote for you: \$4,100 a year/);
  await expect(dialog.getByRole('button', { name: 'Send Text' })).toBeDisabled();

  await dialog.getByRole('navigation', { name: 'Sales steps' }).getByRole('button', { name: /Bind/ }).click();
  await dialog.getByRole('button', { name: 'Bound', exact: true }).click();
  await expect(dialog.getByLabel('Auto bound premium')).toHaveValue('1450');
  await dialog.getByRole('button', { name: /Mark Bound · 2 Policies/ }).click();
  await expect(dialog.getByText(/Bound\. The lead is closed as Won/)).toBeVisible();
  expect(writes.find(w => w.table === 'sales_binds').body).toMatchObject({ lead_id: 'W1', quote_id: 'Q9', bundle_type: 'preferred_bundle' });
  expect(writes.find(w => w.table === 'bound_items').body).toEqual([
    expect.objectContaining({ product: 'auto', item_count: 2, premium: 1450, term_months: 6 }),
    expect.objectContaining({ product: 'home', item_count: 1, premium: 1200, term_months: 12 }),
  ]);
});

test('a winback never quoted can still be closed Lost', async ({ page }) => {
  const writes = await openLead(page);
  const dialog = page.getByRole('dialog', { name: 'Sales workspace' });
  await dialog.getByRole('navigation', { name: 'Sales steps' }).getByRole('button', { name: /Bind/ }).click();
  await dialog.getByRole('button', { name: 'Lost', exact: true }).click();
  await dialog.getByRole('radio', { name: /No response/ }).click();
  await dialog.getByRole('button', { name: 'Mark Lost' }).click();
  await expect(dialog.getByText('Marked Lost. The lead is closed.')).toBeVisible();
  expect(writes.find(w => w.table === 'leads').body).toMatchObject({ status: 'closed_lost', disposition_reason: 'no_response' });
});

test('History holds texts, activity and where they came from', async ({ page }) => {
  await openLead(page);
  const dialog = page.getByRole('dialog', { name: 'Sales workspace' });
  await dialog.getByRole('button', { name: 'History' }).click();
  for (const h of ['Texts', 'Activity', 'Where They Came From', 'Response Time']) await expect(dialog.getByRole('heading', { name: h })).toBeVisible();
  await expect(dialog.getByText('Batch Lead · No SLA')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Link Referrer' })).toBeVisible();
});

test('a lead with uploads opens its Rate Check workspace', async ({ page }) => {
  const old = iso(3);
  const rc = { agency_id: AG, id: 'a1', lead_id: 'L1', first_name: 'Stephen', phone: '6785550107', status: 'extracted', created_at: old, consent_given_at: old, is_test: false,
    extract_confidence: 'high', duplicate_of: null, carrier: 'State Farm', policy_type: 'auto', annual_premium: 6980, current_premium: 3490, term_months: 6, extracted: { insured_name: 'Stephen Pearson' } };
  await openLead(page, { lead: { ...winback, id: 'L1', source: 'rate_check', first_name: 'Stephen', callback_note: null }, rcs: [rc] });
  const dialog = page.getByRole('dialog', { name: 'Sales workspace' });
  await expect(dialog.getByRole('heading', { name: 'Stephen Pearson' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /Quoted It in Allstate/ })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Lead Record/ })).toHaveCount(0);
});
