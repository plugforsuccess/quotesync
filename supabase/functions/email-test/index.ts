// supabase/functions/email-test/index.ts
// "Send Me a Test" on the Texts & Scripts page: emails the signed-in principal one email,
// with the saved wording, the shared layout and sample blanks (Dana, State Farm, …).
// POST { id: 'ddRetake' | 'ddStall' | 'ddCert' | 'ddStaff' | 'rcUpload' | 'listStep1'-'listStep3', list_id? } → { sent_to }.
// With list_id (a list's email): that list's own wording if it's customized.
// It sends to the "Send Tests To" address the principal set (site_copy email.test.to), else
// their own sign-in email.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { EMAIL_TEMPLATES, loadEmailCopy, renderEmail, sendEmail } from '../_shared/email.ts'
import { SAMPLE_VARS, listStepTemplate } from '../_shared/emailTemplates.ts'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user?.email) return json({ error: 'Sign in first.' }, 401)

  const { data: principal } = await supabase.from('agency_memberships').select('agency_id')
    .eq('user_id', user.id).eq('agency_role', 'principal').eq('status', 'active').limit(1).maybeSingle()
  if (!principal) return json({ error: 'Only the principal can send test emails.' }, 403)

  const { id, list_id: listId } = await req.json().catch(() => ({}))
  if (!EMAIL_TEMPLATES[String(id)]) return json({ error: 'Unknown email.' }, 400)

  const site = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/+$/, '')
  const saved = await loadEmailCopy(supabase)
  // "Send Tests To" on the Texts & Scripts page (principal-only), else the principal's sign-in email.
  const setTo = (saved['email.test.to'] || '').trim().toLowerCase()
  const to = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(setTo) ? setTo : user.email
  let template = EMAIL_TEMPLATES[String(id)]
  let words = saved
  const step = /^listStep([1-3])$/.exec(String(id))
  if (step && listId) {
    const { data: list } = await supabase.from('contact_lists').select('id, custom_emails')
      .eq('id', String(listId)).eq('agency_id', principal.agency_id).maybeSingle()
    if (!list) return json({ error: 'Unknown list.' }, 400)
    const own = listStepTemplate(Number(step[1]), list.id, list.custom_emails, saved)
    template = own.template
    words = own.saved
  }
  const msg = renderEmail({
    template,
    saved: words,
    vars: {
      ...SAMPLE_VARS,
      'course link': `${site}/courses/defensive-driving`,
      'certificate link': `${site}/courses/defensive-driving/portal`,
      'queue link': `${site}/defensive-driving/queue`,
      'lead link': `${site}/agency/leads/rate-checks`,
      link: `${site}/?start=1`,
    },
    // A test shows the unsubscribe line without a working link (it would opt the principal out).
    unsubscribeUrl: template.unsub ? `${site}/` : undefined,
  })
  const r = await sendEmail({ to: [to], ...msg, subject: `[Test] ${msg.subject}` })
  if (!r.ok && !Deno.env.get('RESEND_API_KEY')) {
    // Help find a misnamed secret: the names (never the values) that look like it, and which project this is.
    const near = Object.keys(Deno.env.toObject()).filter(n => /resend|mail|api_?key/i.test(n) && !n.startsWith('SUPABASE_'))
    const project = (Deno.env.get('SUPABASE_URL') || '').replace(/^https:\/\/|\.supabase\.co.*$/g, '')
    return json({ error: `${r.error} Project ${project} has ${near.length ? `these similar secrets: ${near.map(n => JSON.stringify(n)).join(', ')}` : 'no secret with a similar name'}.` }, 502)
  }
  if (!r.ok) return json({ error: r.error }, 502)
  return json({ sent_to: to })
})
