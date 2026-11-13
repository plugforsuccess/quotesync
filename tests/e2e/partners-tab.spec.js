/* global Buffer */
// Agency side of the referral partner program: Rate Checks → Partners.
// Supabase is mocked; the test checks what the page shows and what it writes.
import { test, expect } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 900 } });

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

async function openPartners(page) {
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('tab', { name: 'Affiliates' }).click();
  // Partners show as a list; tap one for their details.
  await page.getByRole('region', { name: 'Affiliates' }).getByRole('button', { name: /Javon Yarbrough/ }).click();
  await expect(page.getByRole('heading', { name: 'Javon Yarbrough' })).toBeVisible();
}

test('with the reply-Y rule on, only households that replied Y are owed', async ({ page }) => {
  await mock(page, { partners: [partner()], rules: null, payouts: [] });
  await openPartners(page);
  const card = page.locator('#partner-' + PID);
  await expect(card.getByText('2 households in')).toBeVisible();
  // Stephen (auto + home, replied Y) is $45; Ana is waiting. This month pays on the 21st of next month.
  await expect(card.getByText(/^Pays [A-Z][a-z]+ 21$/)).toBeVisible();
  await card.getByRole('button', { name: /2 households in/i }).click();
  await expect(card.getByText('Replied Y')).toBeVisible();
  await expect(card.getByText('Not texted yet')).toBeVisible();
  // The texting-setup note is hidden.
  await expect(page.getByText(/until the agency has a Twilio number/)).toHaveCount(0);
});

test('turning the reply-Y rule off saves it, and quoted households become payable', async ({ page }) => {
  // Households from two months ago: past their pay day, so they can be marked paid.
  const state = { partners: [partner()], rules: null, payouts: [], scans: makeScans(twoMonthsAgo()) };
  const writes = await mock(page, state);
  await openPartners(page);
  const rules = page.getByRole('region', { name: 'Payout rules' });
  await rules.getByRole('button', { name: 'Edit' }).click();
  await rules.getByLabel('Pay only after the customer replies Y').uncheck();
  await rules.getByRole('button', { name: 'Save rules' }).click();
  await expect.poll(() => writes.filter(w => w.table.startsWith('rate_check_partner_rules')).length).toBe(1);
  expect(writes.find(w => w.table.startsWith('rate_check_partner_rules')).body).toMatchObject({ agency_id: AG, require_call_confirm: false, quote_days: 7, expired_days: 30, min_payout: 50 });
  // $45 (auto + home) + $10 (auto) = $55, W-9 on file → can be marked paid.
  const card = page.locator('#partner-' + PID);
  const pay = card.getByRole('button', { name: /^Mark \$55 paid \([A-Z][a-z]+ activity\)$/ });
  await expect(pay).toBeVisible();
  await pay.click();
  await expect.poll(() => writes.filter(w => w.table.startsWith('rate_check_promoter_payouts')).length).toBe(1);
  const rows = writes.find(w => w.table.startsWith('rate_check_promoter_payouts')).body;
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ agency_id: AG, promoter_id: PID, households: 2, amount: 55, paid_by: UID });
});

test('no W-9 on file: the payout is held', async ({ page }) => {
  await mock(page, { partners: [partner({ w9_received_at: null, w9_tin_last4: null })], rules: { agency_id: AG, require_call_confirm: false, quote_days: 7, expired_days: 30, min_payout: 50 }, payouts: [] });
  await openPartners(page);
  const card = page.locator('#partner-' + PID);
  // This month's households pay on the 21st of next month; the W-9 is flagged ahead of time.
  await expect(card.getByText(/^Pays [A-Z][a-z]+ 21$/)).toBeVisible();
  await expect(card.getByText('W-9 needed', { exact: true })).toHaveCount(1); // the badge at the top
  await expect(card.getByRole('button', { name: /Mark .* paid/ })).toHaveCount(0);
  // The welcome text to the partner is ready to send, with the portal link and the three steps.
  // Tapping the portal link opens a drawer: Copy, Text, Open.
  await card.getByRole('button', { name: /^Affiliate Portal: Copy, Text or Open$/ }).click();
  const drawer = page.getByRole('dialog', { name: 'Affiliate Portal' });
  await expect(drawer.getByText('Private: it’s their login, so send it only to them.')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Copy' })).toBeVisible();
  await expect(drawer.getByRole('link', { name: 'Open' })).toHaveAttribute('href', new RegExp(`/affiliate/${'a'.repeat(48)}$`));
  const sms = await drawer.getByRole('link', { name: 'Text Javon' }).getAttribute('href');
  expect(sms).toMatch(/^sms:\+14045550123\?&body=/);
  const body = decodeURIComponent(sms.split('body=')[1]);
  expect(body).toContain(`/affiliate/${'a'.repeat(48)}`);
  expect(body).toContain('Sign my W-9');
  expect(body).toContain('Home Screen');
  expect(body).toContain('Copy link');
  await drawer.getByRole('button', { name: 'Close' }).click();
  await expect(drawer).toHaveCount(0);
});

test('adding a partner: checks the fields and saves the mailing address for their W-9', async ({ page }) => {
  const state = { partners: [partner()], rules: null, payouts: [] };
  const writes = await mock(page, state);
  await openPartners(page);
  await page.getByRole('button', { name: 'Add affiliate' }).first().click();
  const add = page.locator('form').filter({ has: page.getByLabel('First name *') });
  await add.getByLabel('First name *').fill('Stephen');
  await expect(add.getByRole('button', { name: 'Add affiliate' })).toBeDisabled(); // last name still missing
  await add.getByLabel('Last name *').fill(' Pearson ');
  await add.getByLabel('Email').fill('stephen@yahoo@com');
  await expect(add.getByText("That email doesn't look right", { exact: false })).toBeVisible();
  await expect(add.getByRole('button', { name: 'Add affiliate' })).toBeDisabled();
  await add.getByLabel('Email').fill('stephen@yahoo.com');
  await add.getByLabel('Mobile').fill('4045550199');
  await add.getByLabel('Street address').fill('22 Pine St');
  await expect(add.getByText(/Finish the address/)).toBeVisible();
  await add.getByLabel('City').fill('Covington');
  await add.getByLabel('ZIP').fill('30014');
  await add.getByRole('button', { name: 'Add affiliate' }).click();
  await expect.poll(() => writes.filter(w => w.table.startsWith('rate_check_promoters') && w.method === 'POST').length).toBe(1);
  const saved = writes.find(w => w.table.startsWith('rate_check_promoters') && w.method === 'POST').body;
  expect(saved).toMatchObject({ agency_id: AG, name: 'Stephen Pearson', phone: '4045550199', email: 'stephen@yahoo.com', mailing_address: '22 Pine St', mailing_city_state_zip: 'Covington, GA 30014' });
});

test('Send pitch shares the message and the four screenshots', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = async (d) => { window.__shared = { text: d.text, files: (d.files || []).map(f => [f.name, f.type, f.size]) }; };
  });
  await mock(page, { partners: [partner()], rules: null, payouts: [] });
  await openPartners(page);
  await page.getByRole('button', { name: 'Send affiliate pitch' }).click();
  await expect.poll(() => page.evaluate(() => window.__shared?.files?.length || 0)).toBe(4);
  const shared = await page.evaluate(() => window.__shared);
  expect(shared.text).toContain('extra pocket money');
  expect(shared.files.map(f => f[0])).toEqual(['1-what-your-friends-see.jpg', '2-they-send-their-policy.jpg', '3-your-partner-page.jpg', '4-track-your-earnings.jpg']);
  for (const [, type, size] of shared.files) { expect(type).toBe('image/jpeg'); expect(size).toBeGreaterThan(20000); }
});

test('Scripts: what to say and text, one tap to copy or text (Texts & Scripts page)', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await mock(page, { partners: [partner()], rules: null, payouts: [] });
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('tablist').getByRole('button', { name: /^More/ }).click();
  await page.getByRole('button', { name: /^Texts & Scripts/ }).click();
  await expect(page.getByRole('article', { name: 'Say It in the Room' })).toBeVisible();
  const text = page.getByRole('article', { name: 'Text Right After' });
  const href = await text.getByRole('link', { name: 'Text: Text Right After' }).getAttribute('href');
  expect(decodeURIComponent(href)).toContain('insuredbycam.com');
  await text.getByRole('button', { name: 'Copy' }).click();
  await expect(text.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Check My Rate');
  await expect(page.getByRole('article', { name: 'Reconnect After a Quote That Came in High' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Ask Them to Share' }).getByRole('button', { name: 'Send affiliate pitch' })).toBeVisible();
});

test('Emails on Texts & Scripts: button label, unsubscribe only on reminders, Send Me a Test', async ({ page }) => {
  await mock(page, { partners: [partner()], rules: null, payouts: [] });
  const tests = [];
  await page.route(`${SB}/functions/v1/email-test`, async (route) => {
    tests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sent_to: 'cam@example.com' }) });
  });
  await page.goto('/agency/texts');
  const stall = page.getByRole('article', { name: 'Pick Up Where You Left Off' });
  await expect(stall.getByText('Continue Your Course')).toBeVisible();
  await expect(stall.getByText(/Unsubscribe/)).toBeVisible();
  await expect(stall.getByRole('button', { name: 'Copy' })).toHaveCount(0);
  const cert = page.getByRole('article', { name: 'Your Certificate Is Ready' });
  await expect(cert.getByText('Download Your Certificate')).toBeVisible();
  await expect(cert.getByText(/Unsubscribe/)).toHaveCount(0);
  const upload = page.getByRole('region', { name: 'Team Emails' }).getByRole('article', { name: 'A Customer Uploaded Their Policy' });
  await upload.getByRole('button', { name: 'Send Me a Test' }).click();
  await expect(upload.getByRole('status')).toHaveText('Sent to cam@example.com.');
  expect(tests).toEqual([{ id: 'rcUpload' }]);
  await expect(page.getByRole('region', { name: 'Email mailing address' })).toContainText('Not set yet');
});

test('partner floor: recruit link, activated partners count for their recruiter, new partners credited', async ({ page }) => {
  // Javon signed and sent households this month, recruited by Cam: 1 of 2. A partner who
  // signed but never sent anyone doesn't count.
  const state = { partners: [partner({ agreement_signed_at: iso(1), recruited_by: UID }), partner({ id: 'p2', name: 'Kim Lee', phone: '4045550999', agreement_signed_at: iso(1), recruited_by: 'amy' })], rules: null, payouts: [] };
  const writes = await mock(page, state);
  await page.goto('/agency/leads/rate-checks');
  await page.getByRole('tab', { name: 'Affiliates' }).click();
  const floor = page.getByRole('region', { name: 'Affiliate floor' });
  await expect(floor).toContainText('1of 2');
  await expect(floor).toContainText('1 more to activate this month.');
  await expect(floor.getByRole('button', { name: 'Copy Link' })).toBeVisible();
  await expect(floor.getByRole('link', { name: 'Text It' })).toHaveAttribute('href', /affiliates%3Fby%3DCAMREC01/);
  await expect(floor.getByRole('listitem').filter({ hasText: 'Cam Wiley' })).toContainText('1 / 2');
  await expect(floor.getByRole('listitem').filter({ hasText: 'Amy Producer' })).toContainText('0 / 2');

  // The partner's card says who recruited them; adding a partner credits whoever adds them.
  await page.getByRole('region', { name: 'Affiliates' }).getByRole('button', { name: /Javon Yarbrough/ }).click();
  await expect(page.getByLabel('Recruited by, for Javon Yarbrough')).toHaveValue(UID);
  await page.getByLabel('Recruited by, for Javon Yarbrough').selectOption('amy');
  await expect.poll(() => writes.find(w => w.table.startsWith('rate_check_promoters') && w.method === 'PATCH')?.body).toMatchObject({ recruited_by: 'amy' });
});
