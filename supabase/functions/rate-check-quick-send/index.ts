// Supabase Edge Function: rate-check-quick-send
// POST /functions/v1/rate-check-quick-send   (verify_jwt = false — /qs works logged out)
//
// Quick Send: while talking to someone, a producer texts them a link to upload their
// dec page, from the agency's Twilio number. The /qs page proves who the producer is
// with a key, never a login:
//   - a phone set up once (mode 'pair', from a logged-in session) keeps a permanent key;
//   - a borrowed phone signs in with the producer's time-clock PIN (mode 'pin') and gets
//     a key that lasts one shift (12 hours).
// Each send is a rate_check_invites row (source 'quick_send'), so the upload lands in
// the Rate Checks inbox credited to the producer, like any invite link.
//
// Modes:
//   pair         (logged-in JWT) { label }                  → { device_key, producer_first }
//   pin          { pin, label }                              → { device_key, producer_first, expires_at }
//   whoami       { device_key }                              → { producer_first, enabled }
//   send         { device_key, request_id, first_name, phone } → { invite, link, status }
//   status       { device_key, invite_id }                   → { invite }
//   recent       { device_key }                              → { invites }
//   sign_out     { device_key }                              → ends a PIN sign-in (set-up phones are removed in the app)
//   settings     (logged-in JWT)                             → { enabled, can_change }
//   set_enabled  (logged-in JWT, principal) { enabled }      → { enabled }
// Twilio delivery callbacks (form-encoded, signed) update sms_status.
//
// The text is a one-time link the person asked for during the conversation. Pressing
// "Send Requested DEC Link" is the producer's confirmation of that; it is logged
// (attested_at, script_version) and never counts as consent to automated texts —
// that is only the optional box on the scanner's last step (rate_checks.sms_consent).
//
// Secrets: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (agencies.twilio_from_number wins).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

// What the person hears, and what they get. Change either? Bump its version.
const SCRIPT_VERSION = 'qs-script-v1'
const MESSAGE_VERSION = 'qs-sms-v1'
const SENDER = 'insuredbycam.com (Cam Wiley Agency, Inc.)'
const message = (link: string) =>
  `${SENDER}: Here is the secure link you requested to upload your dec page for an agent-prepared quote: ${link} Reply STOP to opt out.`

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

async function fromJwt(supabase: any, req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const { data } = await supabase.auth.getUser(token)
  const user = data?.user
  if (!user) return null
  const { data: m } = await supabase.from('agency_memberships')
    .select('agency_id, agency_role').eq('user_id', user.id).eq('status', 'active').order('created_at').limit(1)
  if (!m?.[0]) return null
  return { userId: user.id, agencyId: m[0].agency_id, role: m[0].agency_role }
}

async function enabled(supabase: any, agencyId: string) {
  const { data } = await supabase.from('agencies').select('quick_send_enabled').eq('id', agencyId).maybeSingle()
  return !!data?.quick_send_enabled
}

const INVITE_COLS = 'id, code, producer_name, first_name, phone, created_at, expires_at, opened_at, open_count, upload_count, last_rate_check_id, sms_status, sms_status_at, sms_error'

// ── Twilio delivery callbacks ────────────────────────────────────────────────
// Signature: base64(HMAC-SHA1(auth token, callback URL + each param name+value, sorted by name)).
async function twilioSignatureOk(url: string, params: URLSearchParams, signature: string | null) {
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!token || !signature) return false
  const data = url + [...params.keys()].sort().map(k => k + params.get(k)).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)))
  const expected = btoa(String.fromCharCode(...sig))
  if (expected.length !== signature.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
  return diff === 0
}

// Twilio's statuses, collapsed to what the page shows. A later status never moves backwards.
const STATUS_RANK: Record<string, number> = { requested: 0, queued: 1, sent: 2, delivered: 3, failed: 3, blocked: 3 }
function fromTwilio(s: string): string | null {
  if (['accepted', 'queued', 'sending', 'scheduled'].includes(s)) return 'queued'
  if (s === 'sent') return 'sent'
  if (s === 'delivered') return 'delivered'
  if (['failed', 'undelivered', 'canceled'].includes(s)) return 'failed'
  return null
}

async function onTwilioCallback(req: Request, supabase: any, callbackUrl: string) {
  const params = new URLSearchParams(await req.text())
  if (!(await twilioSignatureOk(callbackUrl, params, req.headers.get('x-twilio-signature')))) {
    return new Response('bad signature', { status: 403 })
  }
  const sid = params.get('MessageSid')
  const status = fromTwilio(String(params.get('MessageStatus') || ''))
  if (sid && status) {
    const { data: inv } = await supabase.from('rate_check_invites').select('id, sms_status').eq('sms_sid', sid).maybeSingle()
    // Retries and out-of-order callbacks never move a status backwards.
    if (inv && (STATUS_RANK[status] ?? 0) > (STATUS_RANK[inv.sms_status] ?? -1)) {
      const code = params.get('ErrorCode')
      await supabase.from('rate_check_invites').update({
        sms_status: status, sms_status_at: new Date().toISOString(),
        ...(status === 'failed' ? { sms_error: code ? `Carrier error ${code}` : 'Not delivered' } : {}),
      }).eq('id', inv.id)
    }
  }
  return new Response('<Response/>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
}

async function sendSms(to: string, from: string, body: string, statusCallback: string) {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID'), token = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!sid || !token || !from) return { ok: false, error: 'Texting isn’t set up for this agency.' }
  let res: Response
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ To: `+1${to}`, From: from, Body: body, StatusCallback: statusCallback }).toString(),
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: data.message || `Twilio ${res.status}` }
  return { ok: true, sid: data.sid as string, status: fromTwilio(String(data.status || 'queued')) || 'queued' }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const callbackUrl = `${supabaseUrl}/functions/v1/rate-check-quick-send?twilio=status`

  if ((req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
    return onTwilioCallback(req, supabase, callbackUrl)
  }

  const clientIp = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400, cors) }
  const mode = String(body?.mode || '')

  // ── Logged-in modes (the app) ──
  if (mode === 'pair' || mode === 'settings' || mode === 'set_enabled') {
    const caller = await fromJwt(supabase, req)
    if (!caller) return json({ error: 'Log in to QuoteSync first.' }, 401, cors)

    if (mode === 'settings') {
      return json({ enabled: await enabled(supabase, caller.agencyId), can_change: caller.role === 'principal' }, 200, cors)
    }
    if (mode === 'set_enabled') {
      if (caller.role !== 'principal') return json({ error: 'Only the agency principal can turn Quick Send on or off.' }, 403, cors)
      const on = body.enabled === true
      const { error } = await supabase.from('agencies').update({ quick_send_enabled: on }).eq('id', caller.agencyId)
      if (error) return json({ error: 'Couldn’t save that. Try again.' }, 500, cors)
      return json({ enabled: on }, 200, cors)
    }
    // pair: this phone gets a permanent key for this producer.
    const key = newKey()
    const name = await producerName(supabase, caller.userId, null)
    const { error } = await supabase.from('rate_check_qs_devices').insert({
      agency_id: caller.agencyId, user_id: caller.userId, producer_name: name,
      label: cleanText(body.label, 80) || 'Phone', key_hash: await sha256Hex(key),
    })
    if (error) { console.error('[QUICK_SEND] pair failed:', error.message); return json({ error: 'Couldn’t set up this phone. Try again.' }, 500, cors) }
    return json({ device_key: key, producer_first: firstOf(name) }, 200, cors)
  }

  // ── PIN sign-in (a borrowed phone) → a key for one shift ──
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
    const expires = new Date(Date.now() + PIN_HOURS * 3600_000).toISOString()
    const name = await producerName(supabase, emp.auth_user_id, [emp.preferred_name || emp.first_name, emp.last_name].filter(Boolean).join(' ') || null)
    const { error } = await supabase.from('rate_check_qs_devices').insert({
      agency_id: emp.org_id, user_id: emp.auth_user_id, producer_name: name,
      label: `PIN · ${cleanText(body.label, 60) || 'Phone'}`, key_hash: await sha256Hex(key), expires_at: expires,
    })
    if (error) { console.error('[QUICK_SEND] pin sign-in failed:', error.message); return json({ error: 'Something went wrong. Try again.' }, 500, cors) }
    return json({ device_key: key, producer_first: firstOf(name), expires_at: expires }, 200, cors)
  }

  // ── Everything else needs a key ──
  const who = await fromKey(supabase, body.device_key)
  if (!who) return json({ error: 'This phone isn’t set up for Quick Send. Sign in with your PIN.', code: 'no_device' }, 401, cors)

  if (mode === 'whoami') {
    return json({ producer_first: firstOf(who.producerName), enabled: await enabled(supabase, who.agencyId), pin: who.pin }, 200, cors)
  }

  if (mode === 'sign_out') {
    if (who.pin) await supabase.from('rate_check_qs_devices').update({ revoked_at: new Date().toISOString() }).eq('id', who.deviceId)
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

  if (mode !== 'send') return json({ error: 'Unknown mode' }, 400, cors)

  // ── Send ──
  if (!(await enabled(supabase, who.agencyId))) return json({ error: 'Quick Send is turned off for your agency.', code: 'disabled' }, 403, cors)
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
  const { data: optedOut } = await supabase.from('leads').select('id')
    .eq('agency_id', who.agencyId).eq('phone', phone).eq('sms_opted_out', true).limit(1)
  const blocked = !!optedOut?.length

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
  const { data: invite, error: insErr } = await supabase.from('rate_check_invites').insert({
    agency_id: who.agencyId, created_by: who.userId, producer_name: who.producerName,
    first_name: firstName, phone, source: 'quick_send', request_id: requestId,
    attested_at: now, script_version: SCRIPT_VERSION, message_version: MESSAGE_VERSION,
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

  const { data: agency } = await supabase.from('agencies').select('twilio_from_number').eq('id', who.agencyId).maybeSingle()
  const from = agency?.twilio_from_number || Deno.env.get('TWILIO_PHONE_NUMBER') || ''
  const sms = await sendSms(phone, from, message(link), callbackUrl)
  const patch = sms.ok
    ? { sms_sid: sms.sid, sms_status: sms.status, sms_status_at: new Date().toISOString() }
    : { sms_status: 'failed', sms_status_at: new Date().toISOString(), sms_error: String(sms.error).slice(0, 300) }
  if (!sms.ok) console.error('[QUICK_SEND] twilio failed:', sms.error)
  const { data: updated } = await supabase.from('rate_check_invites').update(patch).eq('id', invite.id).select(INVITE_COLS).single()
  return json({ invite: updated || { ...invite, ...patch }, link }, 200, cors)
})
