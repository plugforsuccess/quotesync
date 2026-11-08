// supabase/functions/list-followups/index.ts
// List follow-up sequences, run once a day by pg_cron (POST). For each list with
// follow-up on: up to 3 emails, each on its day after the person was added (plan.ts),
// stopping for good when they upload a dec page, get quoted, or unsubscribe.
// Wording: the list's own (Customize Emails on the Lists page) or the shared emails on
// Texts & Scripts (site_copy email.list.step1-3; defaults in ../_shared/emailTemplates.ts).
// At most DAILY_CAP emails a run (LIST_EMAILS_PER_DAY), oldest first, so a big imported
// list goes out in daily waves and the domain's reputation stays healthy.
// GET (or one-click POST) ?unsubscribe=<token> unsubscribes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadEmailCopy, renderEmail, sendEmail } from '../_shared/email.ts'
import { listStepTemplate } from '../_shared/emailTemplates.ts'
import { emailFromToken, unsubscribePage, unsubscribeUrl } from '../_shared/unsubscribe.ts'
import { nextStep } from './plan.ts'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const digits = (p: unknown) => String(p || '').replace(/\D/g, '').slice(-10)

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  const token = url.searchParams.get('unsubscribe')
  if (token) {
    const email = await emailFromToken(token)
    if (email) await supabase.from('dd_email_opt_outs').upsert({ email }, { onConflict: 'email' })
    return unsubscribePage(!!email)
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const cap = Math.max(1, Number(Deno.env.get('LIST_EMAILS_PER_DAY')) || 80)
  const site = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/+$/, '')
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/list-followups`
  const now = new Date()

  const { data: lists } = await supabase.from('contact_lists')
    .select('id, agency_id, sequence, custom_emails').eq('follow_up_enabled', true).is('archived_at', null)
  if (!lists?.length) return json({ configured: !!resendKey, sent: 0 })
  const listBy = new Map(lists.map(l => [l.id, l]))

  const { data: members } = await supabase.from('contact_list_members')
    .select('id, list_id, agency_id, first_name, email, phone, source, added_by_name, created_at, steps_sent, last_sent_at, stopped_reason')
    .in('list_id', lists.map(l => l.id)).is('stopped_reason', null).lt('steps_sent', 3)
    .order('created_at', { ascending: true }).limit(20000)
  if (!members?.length) return json({ configured: !!resendKey, sent: 0 })

  // What stops a sequence: unsubscribed, uploaded since being added, or quoted/closed as a lead.
  const since = members[0].created_at
  const agencies = [...new Set(lists.map(l => l.agency_id))]
  const [{ data: optOuts }, { data: uploads }, { data: worked }] = await Promise.all([
    supabase.from('dd_email_opt_outs').select('email'),
    supabase.from('rate_checks').select('agency_id, email, phone, created_at').in('agency_id', agencies).gte('created_at', since),
    supabase.from('leads').select('agency_id, email, phone').in('agency_id', agencies).in('status', ['quoted', 'closed_won', 'closed_lost']),
  ])
  const unsub = new Set((optOuts || []).map(o => String(o.email).toLowerCase()))
  const uploadedAt = new Map<string, string>() // `${agency}|email:` / `${agency}|phone:` → latest upload
  for (const u of uploads || []) {
    for (const k of [u.email && `${u.agency_id}|e:${String(u.email).toLowerCase()}`, digits(u.phone).length === 10 && `${u.agency_id}|p:${digits(u.phone)}`]) {
      if (k && (!uploadedAt.has(k) || u.created_at > uploadedAt.get(k)!)) uploadedAt.set(k, u.created_at)
    }
  }
  const quoted = new Set<string>()
  for (const l of worked || []) {
    if (l.email) quoted.add(`${l.agency_id}|e:${String(l.email).toLowerCase()}`)
    if (digits(l.phone).length === 10) quoted.add(`${l.agency_id}|p:${digits(l.phone)}`)
  }

  const saved = await loadEmailCopy(supabase)
  let sent = 0, stopped = 0, due = 0
  const errors: string[] = []
  const emailedToday = new Set<string>() // one email a person a day, even on two lists
  for (const m of members) {
    const list = listBy.get(m.list_id)
    if (!list) continue
    const email = m.email.toLowerCase()
    const keys = [`${m.agency_id}|e:${email}`, digits(m.phone).length === 10 ? `${m.agency_id}|p:${digits(m.phone)}` : '']
    const next = nextStep(m, list.sequence, {
      unsubscribed: unsub.has(email),
      uploaded: keys.some(k => k && (uploadedAt.get(k) || '') >= m.created_at),
      quoted: keys.some(k => k && quoted.has(k)),
    }, now)
    if (!next) continue
    if ('stop' in next) {
      await supabase.from('contact_list_members').update({ stopped_reason: next.stop }).eq('id', m.id)
      stopped++
      continue
    }
    due++
    if (!resendKey || sent >= cap || emailedToday.has(email)) continue
    const n = next.step + 1
    const unsubLink = await unsubscribeUrl(fnUrl, email)
    const { template, saved: words } = listStepTemplate(n, list.id, list.custom_emails, saved)
    const msg = renderEmail({
      template, saved: words, unsubscribeUrl: unsubLink,
      vars: { 'first name': m.first_name.trim().split(/\s+/)[0], producer: (m.added_by_name || 'Cam').trim().split(/\s+/)[0], link: `${site}/?start=1` },
    })
    const res = await sendEmail({ to: [email], ...msg, headers: { 'List-Unsubscribe': `<${unsubLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
    if (!res.ok) { errors.push(`${m.id}: ${res.error}`); continue }
    await supabase.from('contact_list_members').update({ steps_sent: n, last_sent_at: new Date().toISOString() }).eq('id', m.id)
    emailedToday.add(email)
    sent++
  }
  if (errors.length) console.error('[LIST_FOLLOWUPS] send failures:', errors.slice(0, 20).join(', '))
  return json({ configured: !!resendKey, sent, due, stopped, waiting: Math.max(0, due - sent), failed: errors.length })
})
