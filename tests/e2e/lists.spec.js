/* global Buffer */
// Lists: the principal makes lists and imports people; producers add someone who won't
// upload from Quick Send. Supabase and the Quick Send function are mocked.
import { test, expect } from '@playwright/test';

const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } };

async function signedIn(page, state) {
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
    if (p === '/rest/v1/agency_memberships') return json(one ? membership : [membership]);
    if (p === '/rest/v1/feature_permissions') return json([]);
    if (p === '/rest/v1/contact_lists') {
      if (req.method() === 'POST') {
        const body = req.postDataJSON(); writes.push({ table: 'contact_lists', method: 'POST', body });
        const row = { id: `L${state.lists.length + 1}`, follow_up_enabled: false, is_default: false, archived_at: null, created_at: new Date().toISOString(), ...body };
        state.lists.push(row);
        return json(one ? { id: row.id } : [{ id: row.id }], 201);
      }
      if (req.method() === 'PATCH') {
        const body = req.postDataJSON(); writes.push({ table: 'contact_lists', method: 'PATCH', body, query: url.search });
        const id = url.searchParams.get('id')?.replace('eq.', '');
        if (id) state.lists = state.lists.map(l => (l.id === id ? { ...l, ...body } : l));
        else if (body.is_default === false) state.lists = state.lists.map(l => ({ ...l, is_default: false }));
        return json(one ? { id } : [{ id }]);
      }
      return json(state.lists);
    }
    if (p === '/rest/v1/contact_list_members') {
      if (req.method() === 'POST') { const body = req.postDataJSON(); writes.push({ table: 'contact_list_members', body }); state.members.push(...[].concat(body)); return route.fulfill({ status: 201, body: '' }); }
      return json(state.members.map((m, i) => ({ id: `M${i}`, created_at: new Date().toISOString(), followup_sent_at: null, ...m })));
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: one ? '{}' : '[]' });
    return one ? json(null) : json([]);
  });
  return writes;
}

test('the principal makes a list, sets it as the default with follow-up on, and imports a spreadsheet', async ({ page }) => {
  const state = { lists: [], members: [{ list_id: 'L0', first_name: 'x', email: 'x@x.co', source: 'app' }] };
  const writes = await signedIn(page, state);
  await page.goto('/agency/lists');
  await expect(page.getByRole('heading', { name: 'Lists', exact: true })).toBeVisible();
  await page.getByLabel('New list name').fill('Didn’t Upload');
  await page.getByRole('button', { name: 'Create List' }).click();
  await expect(page.getByRole('tab', { name: /Didn’t Upload/ })).toBeVisible();
  expect(writes.find(w => w.method === 'POST' && w.table === 'contact_lists').body).toMatchObject({ name: 'Didn’t Upload', agency_id: AG });

  const detail = page.getByRole('region', { name: 'Didn’t Upload' });
  await detail.getByRole('button', { name: 'Make Default' }).click();
  await expect(detail.getByText(/Default: picked for producers/)).toBeVisible();
  await detail.getByRole('switch', { name: 'Send automatic follow-up' }).click();
  await expect(detail.getByRole('switch', { name: 'Send automatic follow-up' })).toHaveAttribute('aria-checked', 'true');

  const csv = 'Name,E-mail,Mobile,Group\nDana Smith,Dana@Gmail.com,(404) 555-0123,Frat\nNo Email,,,\nMarcus Lee,marcus@example.com,,Neighbor\n';
  await detail.getByLabel('Spreadsheet to import').setInputFiles({ name: 'contacts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(detail.getByText(/2 people ready from contacts.csv; skipping 1 with no email/)).toBeVisible();
  await detail.getByRole('button', { name: 'Import to Didn’t Upload' }).click();
  await expect(detail.getByText('Added 2.')).toBeVisible();
  const rows = writes.find(w => w.table === 'contact_list_members').body;
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ list_id: 'L1', agency_id: AG, first_name: 'Dana', last_name: 'Smith', email: 'dana@gmail.com', phone: '4045550123', notes: 'Frat', source: 'import' });
  await expect(detail.getByText('dana@gmail.com · (404) 555-0123')).toBeVisible();

  await detail.getByRole('button', { name: 'Archive' }).click();
  expect(writes.filter(w => w.method === 'PATCH').at(-1).body).toMatchObject({ is_default: false });
  expect(writes.filter(w => w.method === 'PATCH').at(-1).body.archived_at).toBeTruthy();
});

test('Quick Send: they won’t upload, so the producer adds them to a list (name and number carried over)', async ({ page }) => {
  const calls = [];
  await page.addInitScript(() => localStorage.setItem('qs_quick_send_key', 'k'.repeat(43)));
  await page.route('**/functions/v1/rate-check-quick-send', async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const json = (b, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
    if (body.mode === 'whoami') return json({ producer_first: 'Cam', remembered: true });
    if (body.mode === 'recent') return json({ invites: [] });
    if (body.mode === 'lists') return json({ lists: [{ id: 'L1', name: 'Didn’t Upload', is_default: true }, { id: 'L2', name: 'Frat Brothers', is_default: false }] });
    if (body.mode === 'add_to_list') return json({ member: { id: 'M1' }, list: 'Didn’t Upload' });
    return json({ error: 'Unknown mode' }, 400);
  });
  await page.goto('/qs');
  await page.getByLabel('Name', { exact: true }).fill('keisha');
  await page.getByLabel('Mobile number').fill('4045551212');
  await page.getByRole('button', { name: 'Won’t Upload? Add to a List' }).click();
  const form = page.getByRole('form', { name: 'Add to a list' });
  await expect(form.getByLabel('List')).toHaveValue('L1'); // the principal's default
  await expect(form.getByLabel('First Name')).toHaveValue('keisha');
  await expect(form.getByLabel(/Mobile Number/)).toHaveValue('(404) 555-1212');
  await expect(form.getByRole('button', { name: 'Add to List' })).toBeDisabled(); // email needed
  await form.getByLabel('Email').fill('Keisha@Example.com');
  await form.getByRole('button', { name: 'Add to List' }).click();
  await expect(page.getByText('Added Keisha to Didn’t Upload.')).toBeVisible();
  expect(calls.find(c => c.mode === 'add_to_list')).toMatchObject({ list_id: 'L1', first_name: 'Keisha', email: 'keisha@example.com', phone: '4045551212' });
  expect(calls.some(c => c.mode === 'send')).toBe(false); // no text went out
});

test('Quick Send: no lists yet, no Add to List button', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('qs_quick_send_key', 'k'.repeat(43)));
  await page.route('**/functions/v1/rate-check-quick-send', (route) => {
    const body = route.request().postDataJSON();
    const out = body.mode === 'whoami' ? { producer_first: 'Cam' } : body.mode === 'recent' ? { invites: [] } : { lists: [] };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(out) });
  });
  await page.goto('/qs');
  await expect(page.getByRole('button', { name: 'Send Requested DEC Link' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Add to a List/ })).toHaveCount(0);
});
