/* global Buffer */
// Sales workspace: open a household full screen, review the quote sheet, log the
// Allstate rate for each policy's term. Supabase is mocked; checks what it writes.
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


const old = new Date(Date.now() - 14 * 86400000).toISOString();
const base = { agency_id: AG, lead_id: 'L1', first_name: 'Stephen', phone: '6785550107', email: 'stephen@example.com', status: 'extracted', created_at: old, consent_given_at: old, is_test: false, extract_confidence: 'high', duplicate_of: null, insured_address: '1 Main St, Covington, GA 30014' };
const rows = [
  { ...base, id: 'a1', carrier: 'State Farm', policy_type: 'auto', annual_premium: 6980, current_premium: 3490, term_months: 6, policy_number: 'SF-4421-907', extracted: { insured_name: 'Stephen Pearson' } },
  { ...base, id: 'h1', carrier: 'State Farm', policy_type: 'home', annual_premium: 2936, current_premium: 2936, term_months: 12, extracted: { insured_name: 'Stephen Pearson' } },
];
test('log a household quote: per-policy term rates, saved as annual, then Quote Saved', async ({ page }) => {
  const writes = await mock(page, { partners: [partner()], rules: null, payouts: [] });
  await page.route(SB + '/rest/v1/rate_checks*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() === 'PATCH') {
      const body = req.postDataJSON();
      writes.push({ table: 'rate_checks', q: u.search, body });
      // Keep the household in step with what was saved (allstate_premium in, so the next read has it).
      for (const r of rows) if (u.search.includes(`eq.${r.id}`) || u.search.includes(r.id)) Object.assign(r, body);
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.searchParams.get('promoter_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? rows[0] : rows) });
  });
  await page.goto('/agency/leads/rate-checks');
  await page.locator('li').filter({ hasText: 'Stephen' }).first().click();
  await expect(page.getByRole('heading', { name: 'Quote Sheet' })).toBeVisible();
  await page.getByRole('button', { name: /Save the Quote/ }).click();
  await page.getByLabel(/Allstate 6-month Rate/).fill('2950');
  await page.getByLabel(/Allstate 12-month Rate/).fill('2500');
  await expect(page.getByText('Saves $1,080/yr')).toBeVisible(); // auto: $3,490 vs $2,950 for 6 months
  await expect(page.getByText(/Household · \$8,400\/yr vs \$9,916/)).toBeVisible();
  await page.getByRole('button', { name: /^Save Quote$/ }).last().click();
  await page.getByText('Quote Saved').waitFor();
  // Each policy's rate is saved as annual on its rate check, as the producer who logged it.
  const saved = writes.filter(w => w.table === 'rate_checks');
  expect(saved.slice(0, 2)).toEqual([
    expect.objectContaining({ q: '?id=eq.a1', body: { allstate_premium: 5900, quoted_by: UID } }),
    expect.objectContaining({ q: '?id=eq.h1', body: { allstate_premium: 2500, quoted_by: UID } }),
  ]);
  // Contact: the message is written from the saved quote; Send goes from the agency's number.
  await page.getByRole('button', { name: /Next: Contact Them/ }).click();
  const box = page.getByLabel('Text Message');
  await expect(box).toHaveValue(/saving you \$1,516\. Reply Y/);
  // Auto quote: Send Drivers Ed Link opens Messages with the course link (from your phone until Twilio).
  const de = page.getByRole('link', { name: 'Send Drivers Ed Link' });
  const deHref = decodeURIComponent(await de.getAttribute('href'));
  expect(deHref).toMatch(/^sms:\+1\d{10}\?&body=Hi Stephen, it's Cam with Cam Wiley Agency\. Allstate gives a discount for completing a defensive driving course/);
  expect(deHref).toContain('/courses/defensive-driving');
  await page.getByRole('button', { name: 'Send Text' }).click();
  await expect(page.getByText('Sent from the agency’s number.')).toBeVisible();
  const sms = writes.find(w => (w.table || '').includes('send-manual-sms'));
  expect(sms.body).toMatchObject({ lead_id: 'L1', body: expect.stringContaining('saving you $1,516') });
  expect(writes.some(w => w.table === 'rate_checks' && w.body.quote_ready_texted_at)).toBe(true);
  // The old path that changed the lead's status itself is not used.
  expect(writes.some(w => (w.table || '').includes('rate-check-outcome'))).toBe(false);
});

async function openClose(page, quotedRows) {
  const writes = await mock(page, { partners: [partner()], rules: null, payouts: [] });
  await page.route(SB + '/rest/v1/rate_checks*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (req.method() === 'PATCH') { writes.push({ table: 'rate_checks', q: u.search, body: req.postDataJSON() }); return route.fulfill({ status: 204, body: '' }); }
    if (u.searchParams.get('promoter_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? quotedRows[0] : quotedRows) });
  });
  await page.route(SB + '/rest/v1/sales_quotes*', async (route) => {
    const req = route.request();
    if (req.method() === 'PATCH') { writes.push({ table: 'sales_quotes', q: new URL(req.url()).search, body: req.postDataJSON() }); return route.fulfill({ status: 200, contentType: 'application/json', body: '[{"id":"Q1"}]' }); }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('button', { name: /^All/ }).first().click(); // already quoted: not under Needs Quote
  await page.locator('li').filter({ hasText: 'Stephen' }).first().click();
  await page.getByRole('navigation', { name: 'Sales steps' }).getByRole('button', { name: /Close/ }).click();
  await expect(page.getByRole('heading', { name: 'Policy Bound' })).toBeVisible();
  return writes;
}

test('close: mark bound writes each policy bound with Allstate at its annual premium', async ({ page }) => {
  const quotedRows = rows.map(r => ({ ...r, status: 'won', allstate_premium: r.policy_type === 'auto' ? 5900 : 2500 }));
  const writes = await openClose(page, quotedRows);
  await page.getByRole('button', { name: 'Bound', exact: true }).click();
  await expect(page.getByLabel('Auto bound premium')).toHaveValue('2950'); // 6-month, from the saved quote
  await expect(page.getByLabel('Auto policy number')).toHaveValue(''); // the new Allstate number, not State Farm's
  await expect(page.getByText('Auto New Business')).toBeVisible();
  await expect(page.getByText('Home New Business')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Allstate' })).toHaveCount(2);
  await expect(page.getByText(/Was State Farm/)).toHaveCount(0);
  await page.getByRole('button', { name: /Mark Bound · 2 Policies/ }).click();
  await expect(page.getByText(/Bound\. The lead is closed as Won/)).toBeVisible();
  const bound = writes.filter(w => w.table === 'rate_checks' && w.body.status === 'bound');
  expect(bound.map(w => [w.q, w.body.bound_carrier, w.body.bound_premium])).toEqual([['?id=eq.a1', 'Allstate', 5900], ['?id=eq.h1', 'Allstate', 2500]]);
});

test('close: mark lost closes the household quote with the reason', async ({ page }) => {
  const quotedRows = rows.map(r => ({ ...r, status: 'lost', allstate_premium: 9000 }));
  const writes = await openClose(page, quotedRows);
  await page.getByRole('button', { name: 'Lost', exact: true }).click();
  await page.getByRole('radio', { name: /Price/ }).click();
  await page.getByRole('button', { name: 'Mark Lost' }).click();
  await expect(page.getByText('Marked Lost. The lead is closed.')).toBeVisible();
  expect(writes.find(w => w.table === 'sales_quotes').body).toMatchObject({ status: 'lost', lost_reason: 'price' });
});

test('the drawer top says who referred them; the quote sheet says how they know them and the producer', async ({ page }) => {
  await mock(page, { partners: [partner()], rules: null, payouts: [] });
  const r = { ...base, id: 'x1', first_name: 'Cameron', status: 'extract_failed', created_at: new Date(Date.now() - 3600000).toISOString(),
    carrier: null, policy_type: null, promoter_id: PID, promoter_name: 'Javon Yarbrough', producer_name: 'Cameron Wiley',
    referrer_relationship: 'friend', contact_relationship: 'self' };
  await page.route(SB + '/rest/v1/rate_checks*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.searchParams.get('promoter_id')) return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    const one = (req.headers().accept || '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(one ? r : [r]) });
  });
  await page.goto('/agency/leads/rate-checks');
  await page.locator('li').filter({ hasText: 'Cameron' }).first().click();
  const drawer = page.getByRole('dialog', { name: 'Sales workspace' });
  await expect(drawer.getByText('Referred by Javon Yarbrough', { exact: true })).toBeVisible();
  await expect(drawer.getByText(/Via Cameron|\(Friend\)|Knows Javon/)).toHaveCount(0);
  if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT, clip: { x: 0, y: 0, width: 390, height: 260 } });
  const from = drawer.locator('section').filter({ has: page.getByRole('heading', { name: 'Where they came from' }) }).last();
  await expect(from.getByText('How they know Javon')).toBeVisible();
  await expect(from.getByText('Friend', { exact: true })).toBeVisible();
  await expect(from.getByText('Producer')).toBeVisible();
  await expect(from.getByText('Cameron', { exact: true })).toBeVisible();
  if (process.env.SHOT2) { await from.scrollIntoViewIfNeeded(); await from.screenshot({ path: process.env.SHOT2 }); }
});
