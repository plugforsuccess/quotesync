// Supabase Edge Function: rate-check-quick-send
// POST /functions/v1/rate-check-quick-send   (verify_jwt = false — /qs works logged out)
//
// Quick Send: while talking to someone, a producer texts them a link to upload their
// dec page, from the agency's Telnyx number. Nobody logs in to QuoteSync: the /qs page
// signs in with the producer's Quick Send PIN (employees.punch_pin — the old time-clock
// PIN) and gets a key. "Keep me signed in" (their own phone) keeps the key until the
// phone is removed in the app; otherwise it lasts one shift (12 hours).
// Each send is a rate_check_invites row (source 'quick_send'), so the upload lands in
// the Rate Checks inbox credited to the producer, like any invite link.
//
// Modes:
//   pin          { pin, label, remember }                    → { device_key, producer_first, expires_at }
//   whoami       { device_key }                              → { producer_first, remembered }
//   send         { device_key, request_id, first_name, phone } → { invite, link, status }
//   status       { device_key, invite_id }                   → { invite }
//   recent       { device_key }                              → { invites }
//   sign_out     { device_key }                              → ends this phone's sign-in
//   lists        { device_key }                              → { lists: [{ id, name, is_default }] }
//   add_to_list  { device_key, list_id, first_name, last_name?, email, phone? } → { member, already }
//                (someone who won't upload: onto a list the principal made, for follow-up email)
//   affiliate_signup { device_key, first_name, last_name?, phone, email? } → { affiliate, already }
//                principal only: signs someone up as an affiliate on the spot (credited to the
//                principal as recruiter). The page texts them their Affiliate Portal link.
//
// The text is a one-time link the person asked for during the conversation. Pressing
// "Send Requested DEC Link" is the producer's confirmation of that; it is logged
// (attested_at, script_version) and never counts as consent to automated texts —
// that is only the optional box on the scanner's last step (rate_checks.sms_consent).
//
// Texts go through Telnyx (_shared/sms.ts; secrets listed there). Delivery updates arrive at
// telnyx-sms-inbound, which updates rate_check_invites by sms_sid.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { optedOut, sendText } from '../_shared/sms.ts'

const allowedOrigins = [
  'https://insuredbycam.com',
  'https://www.insuredbycam.com',
  'https://quotesync.vercel.app',
]
const envOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')
if (envOrigin && !allowedOrigins.includes(envOrigin)) allowedOrigins.push(envOrigin)
for (const o of (Deno.env.get('CORS_EXTRA_ORIGINS') || '').split(',').map(s => s.trim()).filter(Boolean)) allowedOrigins.push(o)
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// What the person hears, and what they get. The owner edits both on the Texts & Scripts
// page (site_copy keys below; defaults kept in step with src/lib/textTemplates.js).
// Each send records the exact wording and its version: v1 is the original wording,
// an edited one is versioned by a fingerprint of its text.
const SCRIPT_KEY = 'script.qs.ask.1'
const MESSAGE_KEY = 'sms.qs.agency.1'
const DEFAULT_SCRIPT = "Can I text you a secure link to upload your current dec page? It comes from insuredbycam.com, operated by Cam Wiley Agency, Inc. It's just the link, nothing else."
const DEFAULT_MESSAGE = 'insuredbycam.com (Cam Wiley Agency, Inc.): Here is the secure link you requested to upload your dec page for an agent-prepared quote: [link]'
const plainQuotes = (s: string) => s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"')

async function fingerprint(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(hash)].slice(0, 4).map(b => b.toString(16).padStart(2, '0')).join('')
}

/** The saved script and text (or the defaults), with versions. */
async function wording(supabase: any) {
  const { data } = await supabase.from('site_copy').select('key, value').in('key', [SCRIPT_KEY, MESSAGE_KEY])
  const saved = Object.fromEntries((data || []).map((r: any) => [r.key, String(r.value || '').trim()]))
  const script = plainQuotes(saved[SCRIPT_KEY] || DEFAULT_SCRIPT)
  const template = plainQuotes(saved[MESSAGE_KEY] || DEFAULT_MESSAGE)
  return {
    script,
    template,
    scriptVersion: script === DEFAULT_SCRIPT ? 'qs-script-v1' : `qs-script-${await fingerprint(script)}`,
    messageVersion: template === DEFAULT_MESSAGE ? 'qs-sms-v1' : `qs-sms-${await fingerprint(template)}`,
  }
}

/** The text as sent: the link filled in (added if an edit dropped it), and STOP always. */
function message(template: string, link: string) {
  let out = template.includes('[link]') ? template.replace(/\[link\]/g, link) : `${template} ${link}`
  if (!/\bSTOP\b/.test(out)) out += ' Reply STOP to opt out.'
  return out
}

const PIN_HOURS = 12
const INVITE_DAYS = 7
const DAILY_SENDS = 50          // per producer
const SAME_NUMBER_HOURS = 24    // one link per number per day
const PIN_PER_IP = 10           // PIN tries per IP per 15 minutes
const PIN_ALL = 60              // PIN tries across everyone per 15 minutes

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function newKey(): string {
  const b = new Uint8Array(32)
  crypto.getRandomValues(b)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function underLimit(supabase: any, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) { console.error('[QUICK_SEND] rate limit check failed:', error.message); return false }
  return data === true
}

const firstOf = (name: string | null | undefined) => String(name || '').trim().split(/\s+/)[0] || null
const cleanText = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)

// A US mobile number: 10 digits, area code and exchange not starting with 0 or 1.
function usPhone(raw: unknown): string | null {
  const d = String(raw || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : null
}

async function activeMember(supabase: any, userId: string, agencyId: string) {
  const { data } = await supabase.from('agency_memberships')
    .select('agency_role').eq('user_id', userId).eq('agency_id', agencyId).eq('status', 'active').limit(1)
  return data?.[0] ?? null
}

async function producerName(supabase: any, userId: string, fallback: string | null) {
  const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return data?.full_name || fallback
}

// The producer behind a key, or why not.
async function fromKey(supabase: any, key: unknown) {
  if (typeof key !== 'string' || key.length < 32) return null
  const { data: d } = await supabase.from('rate_check_qs_devices')
    .select('id, agency_id, user_id, producer_name, expires_at, revoked_at')
    .eq('key_hash', await sha256Hex(key)).maybeSingle()
  if (!d || d.revoked_at || (d.expires_at && Date.parse(d.expires_at) < Date.now())) return null
  if (!(await activeMember(supabase, d.user_id, d.agency_id))) return null
  await supabase.from('rate_check_qs_devices').update({ last_used_at: new Date().toISOString() }).eq('id', d.id)
  return { deviceId: d.id, agencyId: d.agency_id, userId: d.user_id, producerName: d.producer_name, pin: !!d.expires_at }
}

const INVITE_COLS = 'id, code, producer_name, first_name, phone, created_at, expires_at, opened_at, open_count, upload_count, last_rate_check_id, sms_status, sms_status_at, sms_error'

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // Delivery updates come back to telnyx-sms-inbound, which updates the invite.
  const statusWebhook = `${supabaseUrl}/functions/v1/telnyx-sms-inbound`

  const clientIp = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400, cors) }
  const mode = String(body?.mode || '')

  // ── PIN sign-in → a key: kept on their own phone, one shift on a shared one ──
  if (mode === 'pin') {
    const pin = String(body.pin || '')
    if (!/^\d{4}$/.test(pin)) return json({ error: 'Enter your 4-digit PIN.' }, 400, cors)
    if (!(await underLimit(supabase, `qs_pin_ip:${clientIp}`, PIN_PER_IP, 900)) || !(await underLimit(supabase, 'qs_pin_all', PIN_ALL, 900))) {
      return json({ error: 'Too many tries. Wait 15 minutes and try again.' }, 429, cors)
    }
    const { data: emps } = await supabase.from('employees')
      .select('id, org_id, auth_user_id, first_name, preferred_name, last_name')
      .eq('punch_pin', pin).eq('employment_status', 'active').not('auth_user_id', 'is', null).limit(2)
    const emp = emps?.length === 1 ? emps[0] : null
    if (!emp || !(await activeMember(supabase, emp.auth_user_id, emp.org_id))) return json({ error: 'That PIN didn’t work.' }, 401, cors)
    const key = newKey()
    const remember = body.remember !== false
    const expires = remember ? null : new Date(Date.now() + PIN_HOURS * 3600_000).toISOString()
    const name = await producerName(supabase, emp.auth_user_id, [emp.preferred_name || emp.first_name, emp.last_name].filter(Boolean).join(' ') || null)
    const { error } = await supabase.from('rate_check_qs_devices').insert({
      agency_id: emp.org_id, user_id: emp.auth_user_id, producer_name: name,
      label: cleanText(body.label, 60) || 'Phone', key_hash: await sha256Hex(key), expires_at: expires,
    })
    if (error) { console.error('[QUICK_SEND] pin sign-in failed:', error.message); return json({ error: 'Something went wrong. Try again.' }, 500, cors) }
    return json({ device_key: key, producer_first: firstOf(name), expires_at: expires }, 200, cors)
  }

  // ── Everything else needs a key ──
  const who = await fromKey(supabase, body.device_key)
  if (!who) return json({ error: 'Sign in with your Quick Send PIN.', code: 'no_device' }, 401, cors)

  if (mode === 'whoami') {
    const m = await activeMember(supabase, who.userId, who.agencyId)
    return json({ producer_first: firstOf(who.producerName), remembered: !who.pin, can_sign_up_affiliates: m?.agency_role === 'principal' }, 200, cors)
  }

  if (mode === 'sign_out') {
    await supabase.from('rate_check_qs_devices').update({ revoked_at: new Date().toISOString() }).eq('id', who.deviceId)
    return json({ ok: true }, 200, cors)
  }

  if (mode === 'status') {
    const { data } = await supabase.from('rate_check_invites').select(INVITE_COLS)
      .eq('id', String(body.invite_id || '')).eq('agency_id', who.agencyId).eq('created_by', who.userId).maybeSingle()
    if (!data) return json({ error: 'Not found' }, 404, cors)
    return json({ invite: data }, 200, cors)
  }

  if (mode === 'recent') {
    const { data } = await supabase.from('rate_check_invites').select(INVITE_COLS)
      .eq('agency_id', who.agencyId).eq('created_by', who.userId).eq('source', 'quick_send')
      .order('created_at', { ascending: false }).limit(10)
    return json({ invites: data || [] }, 200, cors)
  }

  // ── Sign up an affiliate on the spot (principal only) ──
  if (mode === 'affiliate_signup') {
    const m = await activeMember(supabase, who.userId, who.agencyId)
    if (m?.agency_role !== 'principal') return json({ error: 'Only the principal can sign up affiliates.' }, 403, cors)
    const first = cleanText(body.first_name, 60), last = cleanText(body.last_name, 60)
    const phone = usPhone(body.phone)
    const email = String(body.email || '').trim().toLowerCase().slice(0, 160)
    if (!first) return json({ error: 'Add their first name.' }, 400, cors)
    if (!phone) return json({ error: 'Enter a 10-digit US mobile number.' }, 400, cors)
    if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return json({ error: 'Enter a valid email, or leave it blank.' }, 400, cors)
    if (!(await underLimit(supabase, `qs_aff:${who.userId}`, 50, 86400))) return json({ error: 'That’s the daily limit for sign-ups.' }, 429, cors)
    const cols = 'id, name, phone, email, code, portal_token, active, created_at'
    const { data: existing } = await supabase.from('rate_check_promoters').select(cols)
      .eq('agency_id', who.agencyId).eq('phone', phone).eq('is_test', false).limit(1)
    if (existing?.[0]) return json({ affiliate: existing[0], already: true }, 200, cors)
    const { data, error } = await supabase.from('rate_check_promoters').insert({
      agency_id: who.agencyId, name: [first, last].filter(Boolean).join(' '), phone, email: email || null,
      recruited_by: who.userId, created_by: who.userId,
    }).select(cols).single()
    if (error) { console.error('[QUICK_SEND] affiliate sign-up failed:', error.message); return json({ error: 'Couldn’t sign them up. Try again.' }, 500, cors) }
    return json({ affiliate: data, already: false }, 200, cors)
  }

  // ── Lists: the principal makes them; producers add people who won't upload ──
  if (mode === 'lists') {
    const { data } = await supabase.from('contact_lists').select('id, name, is_default')
      .eq('agency_id', who.agencyId).is('archived_at', null).order('is_default', { ascending: false }).order('name')
    return json({ lists: data || [] }, 200, cors)
  }

  if (mode === 'add_to_list') {
    const firstName = cleanText(body.first_name, 80)
    const email = String(body.email || '').trim().toLowerCase().slice(0, 200)
    if (!firstName) return json({ error: 'Add their first name.' }, 400, cors)
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) return json({ error: 'Enter a valid email.' }, 400, cors)
    const phoneRaw = String(body.phone || '').replace(/\D/g, '')
    const phone = phoneRaw ? usPhone(phoneRaw) : null
    if (phoneRaw && !phone) return json({ error: 'Enter a 10-digit US number, or leave it blank.' }, 400, cors)
    const { data: list } = await supabase.from('contact_lists').select('id, name')
      .eq('id', String(body.list_id || '')).eq('agency_id', who.agencyId).is('archived_at', null).maybeSingle()
    if (!list) return json({ error: 'Pick a list.' }, 400, cors)
    if (!(await underLimit(supabase, `qs_list:${who.userId}`, 100, 86400))) return json({ error: 'That’s the daily limit for adding people.' }, 429, cors)
    const { data: member, error } = await supabase.from('contact_list_members').insert({
      list_id: list.id, agency_id: who.agencyId, first_name: firstName, last_name: cleanText(body.last_name, 80),
      email, phone, source: 'quick_send', added_by: who.userId, added_by_name: who.producerName,
    }).select('id, first_name, email').single()
    if (error) {
      if (error.code === '23505') return json({ already: true, list: list.name }, 200, cors)
      console.error('[QUICK_SEND] add to list failed:', error.message)
      return json({ error: 'Something went wrong. Try again.' }, 500, cors)
    }
    return json({ member, list: list.name }, 200, cors)
  }

  if (mode !== 'send') return json({ error: 'Unknown mode' }, 400, cors)

  // ── Send ──
  const requestId = String(body.request_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return json({ error: 'request_id is required' }, 400, cors)
  const firstName = cleanText(body.first_name, 80)
  const phone = usPhone(body.phone)
  if (!firstName) return json({ error: 'Add their name.' }, 400, cors)
  if (!phone) return json({ error: 'Enter a 10-digit US mobile number.' }, 400, cors)

  const site = (Deno.env.get('RATE_CHECK_LINK_BASE') || 'https://insuredbycam.com').replace(/\/+$/, '')
  const linkFor = (code: string) => `${site}/r/${code}`

  // The same press again (double tap, retry): answer with what already happened.
  const { data: same } = await supabase.from('rate_check_invites').select(INVITE_COLS).eq('request_id', requestId).maybeSingle()
  if (same) return json({ invite: same, link: linkFor(same.code), repeat: true }, 200, cors)

  // Texted STOP to the agency? Never send. Offer the link to show instead.
  const { data: optedOutLead } = await supabase.from('leads').select('id')
    .eq('agency_id', who.agencyId).eq('phone', phone).eq('sms_opted_out', true).limit(1)
  const blocked = !!optedOutLead?.length || await optedOut(supabase, phone)

  // Already sent this number a link today: don't text again — reuse that link.
  if (!blocked) {
    const { data: recent } = await supabase.from('rate_check_invites').select(INVITE_COLS)
      .eq('agency_id', who.agencyId).eq('phone', phone).eq('source', 'quick_send')
      .in('sms_status', ['queued', 'sent', 'delivered'])
      .gte('created_at', new Date(Date.now() - SAME_NUMBER_HOURS * 3600_000).toISOString())
      .order('created_at', { ascending: false }).limit(1)
    if (recent?.[0]) return json({ invite: recent[0], link: linkFor(recent[0].code), already_sent: true }, 200, cors)
  }

  if (!(await underLimit(supabase, `qs_send:${who.userId}`, DAILY_SENDS, 86400))) {
    return json({ error: `That’s ${DAILY_SENDS} sends today — the daily limit. Use Copy link instead.`, code: 'limit' }, 429, cors)
  }

  const now = new Date().toISOString()
  const words = await wording(supabase)
  const { data: invite, error: insErr } = await supabase.from('rate_check_invites').insert({
    agency_id: who.agencyId, created_by: who.userId, producer_name: who.producerName,
    first_name: firstName, phone, source: 'quick_send', request_id: requestId,
    attested_at: now, script_version: words.scriptVersion, message_version: words.messageVersion,
    script_text: words.script, message_text: words.template,
    device_id: who.deviceId, sent_with_pin: who.pin,
    expires_at: new Date(Date.now() + INVITE_DAYS * 86400_000).toISOString(),
    sms_status: blocked ? 'blocked' : 'requested', sms_status_at: now,
    ...(blocked ? { sms_error: 'This number texted STOP' } : {}),
  }).select(INVITE_COLS).single()
  if (insErr) {
    // Lost a race with the same press: return that one.
    const { data: again } = await supabase.from('rate_check_invites').select(INVITE_COLS).eq('request_id', requestId).maybeSingle()
    if (again) return json({ invite: again, link: linkFor(again.code), repeat: true }, 200, cors)
    console.error('[QUICK_SEND] insert failed:', insErr.message)
    return json({ error: 'Something went wrong. Try again.' }, 500, cors)
  }
  const link = linkFor(invite.code)
  if (blocked) return json({ invite, link }, 200, cors)

  const sms = await sendText(phone, message(words.template, link), { webhookUrl: statusWebhook })
  const patch = sms.ok
    ? { sms_sid: sms.id, sms_status: sms.status, sms_status_at: new Date().toISOString() }
    : { sms_status: 'failed', sms_status_at: new Date().toISOString(), sms_error: String(sms.error).slice(0, 300) }
  if (!sms.ok) console.error('[QUICK_SEND] text failed:', sms.error)
  const { data: updated } = await supabase.from('rate_check_invites').update(patch).eq('id', invite.id).select(INVITE_COLS).single()
  return json({ invite: updated || { ...invite, ...patch }, link }, 200, cors)
})
