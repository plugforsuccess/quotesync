// Supabase Edge Function: rate-check-otp
// POST /functions/v1/rate-check-otp   (verify_jwt = false — called from the public /ratecheck page)
//
// Proves the mobile number on the Rate Check form belongs to the person typing it,
// before rate-check accepts their dec page:
//   { mode: 'send',   phone, session_id }        → texts a 6-digit code (10 minutes)
//   { mode: 'verify', phone, session_id, code }  → { verified: true } and marks the row
//   Add channel: 'email' with email (instead of phone) to send / check a code by email
//   (Resend: RESEND_API_KEY, RATE_CHECK_EMAIL_FROM).
// Codes are stored hashed in rate_check_otps; rate-check looks for a verified row
// for the same phone + session before it stores an upload.
//
// Texts go through Telnyx (_shared/sms.ts; secrets listed there).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendText } from '../_shared/sms.ts'

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

const CODE_TTL_SECONDS = 10 * 60
const MAX_ATTEMPTS = 5
const SEND_PER_PHONE = 3      // codes per phone per 10 minutes
const SEND_PER_IP = 10        // codes per IP per minute
const VERIFY_PER_IP = 30      // guesses per IP per minute

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

async function checkRateLimit(supabase: any, key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: windowSeconds })
  if (error) { console.error('[RATE_CHECK_OTP] rate limit check failed:', error.message); return true }
  return data === true
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function sixDigits(): string {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return String(n[0] % 1_000_000).padStart(6, '0')
}

async function sendEmail(to: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'Email is not configured' }
  const from = Deno.env.get('RATE_CHECK_EMAIL_FROM') || Deno.env.get('DD_EMAIL_FROM') || 'Cam Wiley Agency <noreply@insuredbycam.com>'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject: `${code} is your Cam Wiley Agency code`,
      text: `Your Cam Wiley Agency code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for this, you can ignore this email.`,
    }),
  })
  if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
  return { ok: true }
}

// The code they asked for, by text (Telnyx, _shared/sms.ts).
async function sendSMS(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const r = await sendText(to, body)
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const clientIp = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400, cors) }

  const channel = body?.channel === 'email' ? 'email' : 'sms'
  const phone = String(body?.phone || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  const email = String(body?.email || '').trim().toLowerCase().slice(0, 160)
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.slice(0, 64) : ''
  if (channel === 'sms' && phone.length !== 10) return json({ error: 'Enter a 10-digit US mobile number.' }, 400, cors)
  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400, cors)
  // The code is tied to the number or the email it went to.
  const target = channel === 'email' ? email : phone
  const match = (q: any) => (channel === 'email' ? q.eq('channel', 'email').eq('email', email) : q.eq('phone', phone).eq('channel', 'sms'))
  if (!sessionId) return json({ error: 'session_id is required' }, 400, cors)
  const now = Date.now()

  if (body.mode === 'send') {
    if (!(await checkRateLimit(supabase, `otp_send_ip:${clientIp}`, SEND_PER_IP, 60))) return json({ error: 'Too many codes requested. Wait a minute and try again.' }, 429, cors)
    if (!(await checkRateLimit(supabase, `otp_send_${channel}:${target}`, SEND_PER_PHONE, 600))) {
      return json({ error: channel === 'email' ? 'We already emailed that address a few times. Wait 10 minutes and try again.' : 'We already texted that number a few times. Wait 10 minutes and try again.' }, 429, cors)
    }

    const code = sixDigits()
    const { error: insErr } = await supabase.from('rate_check_otps').insert({
      channel, phone: channel === 'sms' ? phone : null, email: channel === 'email' ? email : null,
      session_id: sessionId, code_hash: await sha256Hex(`${target}:${sessionId}:${code}`),
      expires_at: new Date(now + CODE_TTL_SECONDS * 1000).toISOString(),
      ip_address: clientIp !== 'unknown' ? clientIp : null,
    })
    if (insErr) { console.error('[RATE_CHECK_OTP] insert failed:', insErr.message); return json({ error: 'Something went wrong. Please try again.' }, 500, cors) }

    const out = channel === 'email'
      ? await sendEmail(email, code)
      : await sendSMS(`+1${phone}`, `Your Cam Wiley Agency code is ${code}. It expires in 10 minutes.`)
    if (!out.ok) {
      console.error(`[RATE_CHECK_OTP] ${channel} failed:`, out.error)
      return json({ error: channel === 'email' ? 'We couldn’t email that address. Check it and try again.' : 'We couldn’t text that number. Check it and try again.' }, 502, cors)
    }
    return json({ sent: true, expires_in: CODE_TTL_SECONDS }, 200, cors)
  }

  if (body.mode === 'verify') {
    if (!(await checkRateLimit(supabase, `otp_verify_ip:${clientIp}`, VERIFY_PER_IP, 60))) return json({ error: 'Too many tries. Wait a minute and try again.' }, 429, cors)
    const code = String(body.code || '').replace(/\D/g, '')
    if (code.length !== 6) return json({ error: channel === 'email' ? 'Enter the 6-digit code from the email.' : 'Enter the 6-digit code from the text.' }, 400, cors)

    const { data: rows } = await match(supabase.from('rate_check_otps')
      .select('id, code_hash, attempts, expires_at'))
      .eq('session_id', sessionId).is('verified_at', null)
      .order('created_at', { ascending: false }).limit(1)
    const row = rows?.[0]
    if (!row || Date.parse(row.expires_at) < now) return json({ error: 'That code has expired. Send a new one.' }, 400, cors)
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: 'Too many wrong tries. Send a new code.' }, 429, cors)

    if (row.code_hash !== await sha256Hex(`${target}:${sessionId}:${code}`)) {
      await supabase.from('rate_check_otps').update({ attempts: row.attempts + 1 }).eq('id', row.id)
      return json({ error: row.attempts + 1 >= MAX_ATTEMPTS ? 'Too many wrong tries. Send a new code.' : (channel === 'email' ? 'That code isn’t right. Check the email and try again.' : 'That code isn’t right. Check the text and try again.') }, 400, cors)
    }
    await supabase.from('rate_check_otps').update({ verified_at: new Date(now).toISOString() }).eq('id', row.id)
    return json({ verified: true }, 200, cors)
  }

  return json({ error: 'Unknown mode' }, 400, cors)
})
