/* global Buffer */
// Supabase mocked for the Campaigns page (campaigns.spec.js).
const SB = 'https://ghnpzllykteelveezhnv.supabase.co';
const AG = '00000000-0000-0000-0000-000000000001';
const UID = '11111111-2222-4333-8444-555555555555';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: UID, role: 'authenticated', exp: 4102444800 })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', email: 'cam@example.com', app_metadata: {}, user_metadata: {} };
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 9e8, expires_at: 4102444800, user };
const membership = { id: 'm', agency_id: AG, agency_role: 'principal', status: 'active', agencies: { id: AG, name: 'Cam Wiley Agency', brand_name: 'insuredbycam' } };

export async function mockCampaigns(page, state) {
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
    if (p === '/rest/v1/rpc/campaign_audience_count') {
      const a = req.postDataJSON().p_audience;
      return json(a.type === 'leads' ? { people: 14, email: 9, text: 4, sample: ['Stephen', 'Ana', 'Marcus'] } : { people: 3, email: 3, text: 1, sample: ['Javon', 'Logan', 'Erica'] });
    }
    if (p === '/functions/v1/campaigns-run') {
      writes.push({ table: 'test', body: req.postDataJSON() });
      return json({ sent_to: 'cam@example.com' });
    }
    if (p === '/rest/v1/contact_lists') return json([{ id: 'l1', name: 'Didn’t Upload', follow_up_enabled: false, sequence: null, custom_emails: false, is_default: true, archived_at: null }]);
    if (p === '/rest/v1/campaign_enrollments') return json([{ steps_done: 1, stopped_reason: null }, { steps_done: 1, stopped_reason: 'uploaded' }]);
    if (p === '/rest/v1/campaign_sends') return json([{ step: 0, channel: 'email', status: 'sent' }, { step: 0, channel: 'email', status: 'sent' }]);
    if (p === '/rest/v1/campaigns') {
      if (req.method() === 'GET') return json(state.campaigns);
      const body = req.postDataJSON();
      writes.push({ table: 'campaigns', method: req.method(), body });
      if (req.method() === 'POST') {
        const row = { id: `c${state.campaigns.length + 1}`, agency_id: AG, status: 'draft', archived_at: null, ...body };
        state.campaigns = [row, ...state.campaigns];
        return json(one ? row : [row], 201);
      }
      const id = (url.searchParams.get('id') || '').replace('eq.', '');
      state.campaigns = state.campaigns.map(c => (c.id === id ? { ...c, ...body } : c));
      const row = state.campaigns.find(c => c.id === id);
      return json(one ? row : [row]);
    }
    if (req.method() !== 'GET' && req.method() !== 'HEAD') return route.fulfill({ status: 201, contentType: 'application/json', body: one ? '{}' : '[]' });
    return one ? json(null) : json([]);
  });
  return writes;
}

