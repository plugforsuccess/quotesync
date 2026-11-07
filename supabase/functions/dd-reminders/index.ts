// supabase/functions/dd-reminders/index.ts
// Drivers Ed reminder emails, run once a day by pg_cron (POST):
//   • Retake: 60 and 14 days before the student's deadline (see plan.ts: the last auto
//     renewal on or before the 36-month certificate expiry, else the expiry).
//   • Stalled: 3 and 10 days after enrolling, if they haven't passed.
// Wording comes from the Texts & Scripts page (site_copy keys email.dd.*; defaults here
// kept in step with src/lib/textTemplates.js). Every email has an unsubscribe link
// (GET ?unsubscribe=<token>). Nothing is sent, and nothing is logged as sent, until
// RESEND_API_KEY is set (from DD_EMAIL_FROM).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { dueReminder, retakeDeadline, type Reminder } from './plan.ts'

const TEMPLATES: Record<string, { key: string; subject: string; paragraphs: string[] }> = {
  retake: {
    key: 'email.dd.retake',
    subject: 'Keep your Allstate defensive driving discount',
    paragraphs: [
      'Hi [first name],',
      'Your defensive driving certificate from [passed date] needs a refresh by [deadline] to keep your Allstate discount at your next renewal.',
      "Retake Georgia's 6-hour course online, at your own pace: [course link]",
      "When you pass, your new certificate comes straight to us and we'll keep your discount going.",
      'Cam Wiley Agency',
    ],
  },
  stall: {
    key: 'email.dd.stall',
    subject: 'Pick up your defensive driving course where you left off',
    paragraphs: [
      'Hi [first name],',
      "You're [modules done] of [modules total] modules into Georgia's 6-hour defensive driving course. Pick up where you left off: [course link]",
      'Once you pass the final exam, your certificate comes straight to us for your Allstate discount.',
      'Cam Wiley Agency',
    ],
  },
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const html = (body: string) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0F2D6B">${body}</body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const longDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

async function sign(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email))
  return [...new Uint8Array(mac)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)

  // ── Unsubscribe link ──
  const token = url.searchParams.get('unsubscribe')
  if (req.method === 'GET' && token) {
    const [e, sig] = token.split('.')
    let email = ''
    try { email = unb64url(e || '').toLowerCase() } catch { /* bad token */ }
    if (!email || sig !== await sign(email)) return html('<p>That unsubscribe link isn’t valid.</p>')
    await supabase.from('dd_email_opt_outs').upsert({ email }, { onConflict: 'email' })
    return html('<h1 style="font-size:1.4rem">You’re unsubscribed.</h1><p>You won’t get Drivers Ed reminder emails from Cam Wiley Agency anymore.</p>')
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const site = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/+$/, '')
  const courseLink = `${site}/courses/defensive-driving`
  const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/dd-reminders`
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('DD_EMAIL_FROM') || 'Cam Wiley Agency <noreply@insuredbycam.com>'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const { data: enrollments } = await supabase.from('dd_enrollments')
    .select('id, user_id, course_id, status, purchased_at, completed_at, created_at, student_name_snapshot')
    .in('status', ['active', 'completed'])
  const list = enrollments || []
  if (!list.length) return json({ configured: !!resendKey, sent: 0, would_send: 0 })
  const ids = list.map(e => e.id)

  const [{ data: certs }, { data: profiles }, { data: optOuts }, { data: sentRows }, { data: progress }, { data: modules }, { data: copy }] = await Promise.all([
    supabase.from('dd_certificates').select('enrollment_id, issued_at, revoked_at').in('enrollment_id', ids),
    supabase.from('profiles').select('id, email, full_name').in('id', list.map(e => e.user_id)),
    supabase.from('dd_email_opt_outs').select('email'),
    supabase.from('dd_reminder_log').select('enrollment_id, kind, due_on').in('enrollment_id', ids),
    supabase.from('dd_module_progress').select('enrollment_id, completed_at').in('enrollment_id', ids),
    supabase.from('dd_modules').select('id, course_id'),
    supabase.from('site_copy').select('key, value').like('key', 'email.dd.%'),
  ])
  const certBy = new Map((certs || []).filter(c => !c.revoked_at).map(c => [c.enrollment_id, c]))
  const profileBy = new Map((profiles || []).map(p => [p.id, p]))
  const optedOut = new Set((optOuts || []).map(o => String(o.email).toLowerCase()))
  const saved = Object.fromEntries((copy || []).map(r => [r.key, String(r.value || '').trim()]))

  // Latest auto renewal on file per email (retention reports).
  const emails = [...new Set((profiles || []).map(p => String(p.email || '').toLowerCase()).filter(Boolean))]
  const lastRenewal = new Map<string, string>()
  if (emails.length) {
    const { data: renewals } = await supabase.from('renewal_cases').select('email, renewal_date, product')
      .in('email', emails).ilike('product', '%auto%').not('renewal_date', 'is', null)
    for (const r of renewals || []) {
      const e = String(r.email).toLowerCase(); const d = String(r.renewal_date).slice(0, 10)
      if (!lastRenewal.has(e) || d > lastRenewal.get(e)!) lastRenewal.set(e, d)
    }
  }

  const fill = (name: string, vars: Record<string, string>) => {
    const t = TEMPLATES[name]
    const sub = (s: string) => s.replace(/\[([a-z ]+)\]/gi, (m, k) => vars[k.toLowerCase()] ?? m)
    return {
      subject: sub(saved[`${t.key}.subject`] || t.subject),
      paragraphs: t.paragraphs.map((p, i) => sub(saved[`${t.key}.${i + 1}`] || p)).filter(p => p.trim()),
    }
  }

  let sent = 0, wouldSend = 0
  const errors: string[] = []
  for (const e of list) {
    const profile = profileBy.get(e.user_id)
    const email = String(profile?.email || '').toLowerCase()
    if (!email || optedOut.has(email)) continue
    const cert = certBy.get(e.id)
    const passedOn = cert?.issued_at || e.completed_at
    const already = new Set((sentRows || []).filter(r => r.enrollment_id === e.id).map(r => `${r.kind}|${r.due_on}`))
    const due: Reminder | null = dueReminder(
      { status: e.status, enrolledOn: e.purchased_at || e.created_at, passedOn, lastRenewal: lastRenewal.get(email) || null },
      today, already,
    )
    if (!due) continue

    const first = String(e.student_name_snapshot || profile?.full_name || '').trim().split(/\s+/)[0] || 'there'
    const total = (modules || []).filter(m => m.course_id === e.course_id).length
    const done = (progress || []).filter(p => p.enrollment_id === e.id && p.completed_at).length
    const msg = due.kind.startsWith('retake')
      ? fill('retake', { 'first name': first, 'passed date': longDate(passedOn!), deadline: longDate(retakeDeadline(passedOn!, lastRenewal.get(email) || null)), 'course link': courseLink })
      : fill('stall', { 'first name': first, 'modules done': String(done), 'modules total': String(total), 'course link': courseLink })

    if (!resendKey) { wouldSend++; continue }

    const unsub = `${fnUrl}?unsubscribe=${b64url(email)}.${await sign(email)}`
    const text = `${msg.paragraphs.join('\n\n')}\n\nDon't want these reminders? Unsubscribe: ${unsub}`
    const body = msg.paragraphs.map(p => `<p>${esc(p).replace(esc(courseLink), `<a href="${courseLink}">${esc(courseLink)}</a>`)}</p>`).join('')
      + `<p style="color:#64748b;font-size:12px">Don’t want these reminders? <a href="${unsub}">Unsubscribe</a>.</p>`
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email], subject: msg.subject, html: body, text, headers: { 'List-Unsubscribe': `<${unsub}>` } }),
    })
    if (!res.ok) { errors.push(`${e.id}: ${res.status}`); continue }
    await supabase.from('dd_reminder_log').insert({ enrollment_id: e.id, kind: due.kind, due_on: due.dueOn, email })
    sent++
  }
  if (errors.length) console.error('[DD_REMINDERS] send failures:', errors.join(', '))
  return json({ configured: !!resendKey, sent, would_send: wouldSend, failed: errors.length })
})
