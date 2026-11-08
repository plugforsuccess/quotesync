// supabase/functions/list-followups/index.ts
// One follow-up email, run once a day by pg_cron (POST), to people a producer added to a
// list that has "Send automatic follow-up" on: 3 days after they were added, with the
// rate check link. Only people added by the team (Quick Send or the app), never imported
// lists, and only within 14 days of being added, so turning the switch on later doesn't
// email a backlog. Never to anyone on the agency's "don't email" list.
// Wording: Texts & Scripts (site_copy email.list.followup.*; defaults in
// ../_shared/emailTemplates.ts). GET ?unsubscribe=<token> unsubscribes.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { EMAIL_TEMPLATES, loadEmailCopy, renderEmail, sendEmail } from '../_shared/email.ts'
import { emailFromToken, unsubscribePage, unsubscribeUrl } from '../_shared/unsubscribe.ts'
import { followUpsDue } from './plan.ts'

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  // GET from the link, or POST from a mail app's one-click unsubscribe.
  const token = url.searchParams.get('unsubscribe')
  if (token) {
    const email = await emailFromToken(token)
    if (email) await supabase.from('dd_email_opt_outs').upsert({ email }, { onConflict: 'email' })
    return unsubscribePage(!!email)
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const resendKey = Deno.env.get('RESEND_API_KEY')
  const site = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/+$/, '')
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/list-followups`
  const now = new Date()

  const { data: lists } = await supabase.from('contact_lists').select('id').eq('follow_up_enabled', true).is('archived_at', null)
  if (!lists?.length) return json({ configured: !!resendKey, sent: 0, would_send: 0 })
  const { data: members } = await supabase.from('contact_list_members')
    .select('id, list_id, first_name, email, added_by_name, source, created_at, followup_sent_at')
    .in('list_id', lists.map(l => l.id)).is('followup_sent_at', null).neq('source', 'import')
    .gte('created_at', new Date(now.getTime() - 15 * 86400000).toISOString())
  const { data: optOuts } = await supabase.from('dd_email_opt_outs').select('email')
  const due = followUpsDue(members || [], new Set((optOuts || []).map(o => String(o.email).toLowerCase())), now)
  if (!due.length || !resendKey) return json({ configured: !!resendKey, sent: 0, would_send: due.length })

  const saved = await loadEmailCopy(supabase)
  let sent = 0
  const errors: string[] = []
  const done = new Set<string>()
  for (const m of due) {
    const email = m.email.toLowerCase()
    if (done.has(email)) { // on two lists: one email, both marked
      await supabase.from('contact_list_members').update({ followup_sent_at: new Date().toISOString() }).eq('id', m.id)
      continue
    }
    const unsub = await unsubscribeUrl(fnUrl, email)
    const msg = renderEmail({
      template: EMAIL_TEMPLATES.listFollowUp, saved, unsubscribeUrl: unsub,
      vars: { 'first name': m.first_name.trim().split(/\s+/)[0], producer: (m.added_by_name || 'Cam').trim().split(/\s+/)[0], link: `${site}/?start=1` },
    })
    const res = await sendEmail({ to: [email], ...msg, headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
    if (!res.ok) { errors.push(`${m.id}: ${res.error}`); continue }
    await supabase.from('contact_list_members').update({ followup_sent_at: new Date().toISOString() }).eq('id', m.id)
    done.add(email)
    sent++
  }
  if (errors.length) console.error('[LIST_FOLLOWUPS] send failures:', errors.join(', '))
  return json({ configured: true, sent, failed: errors.length })
})
