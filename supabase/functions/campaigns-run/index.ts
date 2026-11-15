// supabase/functions/campaigns-run/index.ts
// Campaigns (the Campaigns page): sends drip and blast emails and texts. Run hourly by
// pg_cron (POST {}); only sends 9am–8pm Eastern. Rules in ./plan.ts.
//
//   1. Each active campaign's audience right now (campaign_audience_people).
//   2. New people join (a drip that skips people already in the audience records them on
//      its first look and never messages them).
//   3. For each person: stop, skip a step they can't get, or send the step that's due.
//   Daily caps (CAMPAIGN_EMAILS_PER_DAY, CAMPAIGN_TEXTS_PER_DAY) keep big lists in waves.
//   Texts only send once texting is set up (Telnyx); until then text steps wait.
//
// POST { mode: 'test', campaign_id, step } (principal or manager): sends that step to the
// "Send Tests To" email (or their sign-in email), or a text to { phone }.
// GET (or one-click POST) ?unsubscribe=<token> unsubscribes from campaign emails.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'
import { loadEmailCopy, renderEmail, sendEmail } from '../_shared/email.ts'
import { digits10, sendText, smsReady } from '../_shared/sms.ts'
import { emailFromToken, unsubscribePage, unsubscribeUrl } from '../_shared/unsubscribe.ts'
import { type Campaign, type Step, emailTemplate, inSendWindow, nextAction, textMessage, varsFor } from './plan.ts'

const SITE = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/+$/, '')

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/campaigns-run`

  const token = url.searchParams.get('unsubscribe')
  if (token) {
    const email = await emailFromToken(token)
    if (email) await supabase.from('dd_email_opt_outs').upsert({ email }, { onConflict: 'email' })
    return unsubscribePage(!!email)
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const body = await req.json().catch(() => ({}))
  if (body?.mode === 'test') return json(...await testSend(supabase, req, body))
  return json(await run(supabase, fnUrl))
})

// ── "Send a Test" ───────────────────────────────────────────────────────────
async function testSend(supabase: any, req: Request, body: any): Promise<[unknown, number]> {
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: { user } } = await supabase.auth.getUser(jwt)
  if (!user?.email) return [{ error: 'Sign in first.' }, 401]
  const { data: c } = await supabase.from('campaigns').select('agency_id, steps').eq('id', String(body.campaign_id || '')).maybeSingle()
  if (!c) return [{ error: 'Save the campaign first.' }, 400]
  const { data: m } = await supabase.from('agency_memberships').select('agency_role')
    .eq('user_id', user.id).eq('agency_id', c.agency_id).eq('status', 'active').in('agency_role', ['principal', 'owner', 'manager']).limit(1).maybeSingle()
  if (!m) return [{ error: 'Only the principal can send tests.' }, 403]
  const step: Step | undefined = (c.steps || [])[Number(body.step) || 0]
  if (!step) return [{ error: 'That step is empty.' }, 400]
  const vars = varsFor({ first_name: 'Dana', extra: { code: 'SAMPLE01', portal_token: 'sample' } }, step, SITE)

  if (step.channel === 'text') {
    const to = digits10(body.phone)
    if (!to) return [{ error: 'Enter your 10-digit cell number.' }, 400]
    const r = await sendText(to, textMessage(step, vars))
    return r.ok ? [{ sent_to: to }, 200] : [{ error: r.error }, 502]
  }
  const saved = await loadEmailCopy(supabase)
  const setTo = (saved['email.test.to'] || '').trim().toLowerCase()
  const to = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(setTo) ? setTo : user.email
  // A test shows the unsubscribe line without a working link (it would opt the principal out).
  const address: Record<string, string> = saved['email.footer.address'] ? { 'email.footer.address': saved['email.footer.address'] } : {}
  const msg = renderEmail({ template: emailTemplate(step), saved: address, vars, unsubscribeUrl: `${SITE}/` })
  const r = await sendEmail({ to: [to], ...msg, subject: `[Test] ${msg.subject}` })
  return r.ok ? [{ sent_to: to }, 200] : [{ error: r.error }, 502]
}

// ── The hourly run ──────────────────────────────────────────────────────────
async function run(supabase: any, fnUrl: string) {
  const now = new Date()
  if (!inSendWindow(now)) return { ok: true, sent: 0, note: 'outside 9am-8pm Eastern' }

  const { data: campaigns } = await supabase.from('campaigns').select('*').eq('status', 'active').is('archived_at', null)
  if (!campaigns?.length) return { ok: true, sent: 0 }

  const emailCap = Math.max(1, Number(Deno.env.get('CAMPAIGN_EMAILS_PER_DAY')) || 200)
  const textCap = Math.max(1, Number(Deno.env.get('CAMPAIGN_TEXTS_PER_DAY')) || 100)
  const textsOn = smsReady()
  const dayStart = new Date(now.getTime() - 20 * 3600000).toISOString() // about "today" for the caps
  const saved = await loadEmailCopy(supabase)
  const address: Record<string, string> = saved['email.footer.address'] ? { 'email.footer.address': saved['email.footer.address'] } : {}

  const [{ data: optOuts }, { data: stops }] = await Promise.all([
    supabase.from('dd_email_opt_outs').select('email'),
    supabase.from('sms_opt_outs').select('phone').is('opted_in_at', null),
  ])
  const unsub = new Set((optOuts || []).map((o: any) => String(o.email).toLowerCase()))
  const stopped = new Set((stops || []).map((o: any) => String(o.phone)))

  const used: Record<string, { email: number; text: number }> = {}
  const totals = { sent: 0, skipped: 0, stopped: 0, joined: 0, waiting_on_texting: 0, failed: 0 }

  for (const c of campaigns as (Campaign & any)[]) {
    if (!used[c.agency_id]) {
      const { data: today } = await supabase.from('campaign_sends').select('channel')
        .eq('agency_id', c.agency_id).eq('status', 'sent').gte('created_at', dayStart)
      used[c.agency_id] = { email: (today || []).filter((r: any) => r.channel === 'email').length, text: (today || []).filter((r: any) => r.channel === 'text').length }
    }
    const u = used[c.agency_id]
    if (c.kind === 'blast' && (!c.send_at || new Date(c.send_at) > now)) continue

    const { data: people, error } = await supabase.rpc('campaign_audience_people', { p_agency: c.agency_id, p_audience: c.audience })
    if (error) { console.error('[CAMPAIGNS] audience', c.id, error.message); continue }
    const byKey = new Map((people || []).map((p: any) => [p.person_key, p]))

    // Join: anyone in the audience who isn't in the campaign yet.
    const { data: existing } = await supabase.from('campaign_enrollments').select('*').eq('campaign_id', c.id)
    const have = new Set((existing || []).map((e: any) => e.person_key))
    const fresh = (people || []).filter((p: any) => !have.has(p.person_key))
    const skipExisting = c.kind === 'drip' && !c.include_existing && !c.baseline_at
    if (fresh.length) {
      const rows = fresh.map((p: any) => ({
        campaign_id: c.id, agency_id: c.agency_id, person_key: p.person_key, first_name: p.first_name || null,
        email: p.email, phone: p.phone, enrolled_at: now.toISOString(), stopped_reason: skipExisting ? 'already_in_audience' : null,
      }))
      for (let i = 0; i < rows.length; i += 500) {
        await supabase.from('campaign_enrollments').upsert(rows.slice(i, i + 500), { onConflict: 'campaign_id,person_key', ignoreDuplicates: true })
      }
      if (!skipExisting) totals.joined += fresh.length
    }
    if (c.kind === 'drip' && !c.baseline_at) await supabase.from('campaigns').update({ baseline_at: now.toISOString() }).eq('id', c.id)

    const { data: enrollments } = await supabase.from('campaign_enrollments').select('*').eq('campaign_id', c.id).is('stopped_reason', null)
    if (!enrollments?.length) {
      if (c.kind === 'blast') await supabase.from('campaigns').update({ status: 'done', finished_at: now.toISOString() }).eq('id', c.id)
      continue
    }

    // Who sent a policy after joining (for "stop when they send their policy").
    let uploads: any[] = []
    if (c.stop_on_upload) {
      const since = enrollments.reduce((m: string, e: any) => (e.enrolled_at < m ? e.enrolled_at : m), enrollments[0].enrolled_at)
      const { data } = await supabase.from('rate_checks').select('email, phone, created_at').eq('agency_id', c.agency_id).gte('created_at', since)
      uploads = data || []
    }
    const uploadedSince = (e: any) => uploads.some(r => r.created_at >= e.enrolled_at && (
      (e.email && String(r.email || '').toLowerCase() === e.email) || (e.phone && digits10(r.phone) === e.phone)))

    let open = 0
    for (const e of enrollments) {
      const p: any = byKey.get(e.person_key)
      const email = (p?.email || e.email || null) as string | null
      const phone = (p?.phone || e.phone || null) as string | null
      const action = nextAction(c, e, {
        inAudience: !!p, uploadedSince: c.stop_on_upload ? uploadedSince(e) : false,
        email, unsubscribed: !!email && unsub.has(email), phone, smsOk: !!p?.sms_ok, textOptedOut: !!phone && stopped.has(phone),
      }, now)
      if (!action) { open++; continue }
      if ('stop' in action) {
        await supabase.from('campaign_enrollments').update({ stopped_reason: action.stop }).eq('id', e.id)
        totals.stopped++
        continue
      }
      if ('skip' in action) {
        await supabase.from('campaign_sends').insert({ campaign_id: c.id, enrollment_id: e.id, agency_id: c.agency_id, step: action.skip, channel: action.channel, status: 'skipped', note: action.note })
        await supabase.from('campaign_enrollments').update({ steps_done: action.skip + 1 }).eq('id', e.id)
        totals.skipped++
        open++
        continue
      }
      open++
      const step: Step = c.steps[action.send]
      const vars = varsFor({ first_name: p?.first_name || e.first_name, extra: p?.extra }, step, SITE)
      let res: { ok: boolean; error?: string }
      if (action.channel === 'text') {
        if (!textsOn) { totals.waiting_on_texting++; continue }
        if (u.text >= textCap) continue
        res = await sendText(phone, textMessage(step, vars))
        if (res.ok) u.text++
      } else {
        if (u.email >= emailCap) continue
        const unsubLink = await unsubscribeUrl(fnUrl, email!)
        const msg = renderEmail({ template: emailTemplate(step), saved: address, vars, unsubscribeUrl: unsubLink })
        res = await sendEmail({ to: [email!], ...msg, headers: { 'List-Unsubscribe': `<${unsubLink}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } })
        if (res.ok) u.email++
      }
      await supabase.from('campaign_sends').insert({
        campaign_id: c.id, enrollment_id: e.id, agency_id: c.agency_id, step: action.send, channel: action.channel,
        status: res.ok ? 'sent' : 'failed', note: res.ok ? null : String(res.error || '').slice(0, 300),
      })
      if (res.ok) {
        await supabase.from('campaign_enrollments').update({ steps_done: action.send + 1, last_sent_at: new Date().toISOString() }).eq('id', e.id)
        totals.sent++
      } else {
        totals.failed++
      }
    }
    // A blast is done once everyone has had it (or been stopped).
    if (c.kind === 'blast' && open === 0) await supabase.from('campaigns').update({ status: 'done', finished_at: now.toISOString() }).eq('id', c.id)
  }
  return { ok: true, texts_on: textsOn, ...totals }
}
