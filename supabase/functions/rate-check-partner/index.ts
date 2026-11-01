// Supabase Edge Function: rate-check-partner
// POST /functions/v1/rate-check-partner   (verify_jwt = false — opened by partners, who have no login)
//
// The partner portal (/partner/TOKEN). The token is a long secret the agency sends the
// partner privately; it is not the public share code.
//   { mode: 'portal', token }                       → who they are, the agreement, and (once
//                                                     signed, or while AGREEMENT_REQUIRED is off)
//                                                     their share code and earnings
//   { mode: 'sign', token, signed_name, accept }    → records the signature; from then on
//                                                     rate-check tags scans from their link
//   { mode: 'photo', token, image, consent }        → (signed partners) their photo for their
//                                                     link's landing page; image is a JPEG data URL
//   { mode: 'photo_remove', token }                 → takes the photo off their link
//   { mode: 'w9', token, …fields }                  → (signed partners) fills IRS Form W-9 from
//                                                     the fields, keeps the PDF in the private
//                                                     partner-w9 bucket; the row keeps TIN type
//                                                     and last 4 only. The TIN is never logged.
//   { mode: 'apply', first_name, last_name, phone, email, is_customer, audience, source }
//                                                     is_customer: agency | allstate_other | allstate_unsure | no
//                                                   → (no token) someone asks to become a partner from
//                                                     the Drivers Ed page; saved to
//                                                     rate_check_partner_applications and the agency's
//                                                     principals are notified. The agency adds them.
// The agreement text below is a DRAFT for the agency's attorney and Allstate compliance
// to review. Changing it means bumping AGREEMENT_VERSION, which asks every partner to
// sign again before their link pays.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { loadBlankW9, W9_REVISION } from './w9Form.ts'

const allowedOrigins = ['https://insuredbycam.com', 'https://www.insuredbycam.com', 'https://quotesync.vercel.app']
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
const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const AGREEMENT_VERSION = 'partner-v2'
// The agreement is off until the attorney / Allstate compliance review is done:
// links work and earnings show without signing, and the draft text isn't shown.
// Turning it on (with the reviewed text and a new AGREEMENT_VERSION) makes each
// partner's portal ask them to sign on their next visit, and their link pauses
// until they do. Keep in step with PARTNER_AGREEMENT_REQUIRED in rate-check and
// src/lib/partnerProgram.js.
export const AGREEMENT_REQUIRED = false

// Same tiers and defaults as src/pages/components/rate-checks/partnerPay.js.
const TIERS: [string, string, number][] = [
  ['auto_home', 'Auto + home or condo', 45],
  ['auto_renters', 'Auto + renters', 15],
  ['home_only', 'Home or condo only', 15],
  ['auto_only', 'Auto only', 10],
  ['renters_only', 'Renters only', 2],
]
const EXTRA_LINE_FEE = 5
const EXTRA_LINE_CAP = 2
const QUOTE_DAYS = 7      // a household pays once quoted, or after this long if nobody got to it
const EXPIRED_DAYS = 30   // a page expired longer ago is an old page from a drawer
const MIN_PAYOUT = 50     // months under this carry over
const DAY = 86400000
const LABEL: Record<string, string> = Object.fromEntries(TIERS.map(([k, l]) => [k, l]))
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

function agreementText(agencyName: string, partnerName: string, schedule: Record<string, number>, cap: number | null) {
  const lines = TIERS.map(([k, label]) => `   - ${label}: ${money(schedule[k])}`).join('\n')
  return [
    `Rate Check Partner Agreement (${AGREEMENT_VERSION})`,
    `Between ${agencyName} ("the Agency") and ${partnerName} ("you").`,
    '',
    '1. What you do. You share your personal Rate Check link. People who choose to use it send the Agency a photo of their current insurance declarations page.',
    '2. What you don\'t do. You are not an insurance agent and you don\'t act like one. You don\'t discuss coverage, compare prices, promise savings, or say anything about whether someone qualifies. Questions go to the Agency.',
    '3. How you\'re paid. A flat fee for each qualified household that sends dec pages through your link, by what the household sends:',
    lines,
    `   - Each extra line (umbrella, a second auto policy): +${money(schedule.extra_line)}, up to ${EXTRA_LINE_CAP}`,
    '   You are paid the same whether or not anyone buys anything. Fees are never a share of commission or premium.',
    `4. What qualifies. A household is one phone number, address or policy, paid once, in the month its first page arrives. A household pays once the Agency has quoted it, or ${QUOTE_DAYS} days after its first page if the Agency hasn't got to it. Pages that can't be read, repeats, pages expired more than ${EXPIRED_DAYS} days, current Allstate policies, test or fake uploads, and anyone who was already the Agency's customer don't count. The Agency decides what qualifies.${cap ? ` At most ${cap} households are paid per month.` : ''}`,
    `5. Payment. Paid monthly for the previous month; a month under ${money(MIN_PAYOUT)} is carried into the next payment. The Agency needs your completed IRS Form W-9 before the first payment and may issue you a Form 1099. Fees for self-referrals, fake or copied uploads, or anything that breaks this agreement are not owed and may be taken back.`,
    '6. Honest promotion. When you post or message about your link, you say clearly that you are paid for referrals (for example, "I get a referral fee"). You only share with people you know or with your own followers: no buying lists, no mass or automated texts, calls or emails.',
    '7. No sharing your fee. You don\'t give any part of your fee, or anything else of value, to the people you refer.',
    '8. Independent. You are an independent contractor, not an employee or agent of the Agency or of Allstate. You can\'t make promises on their behalf.',
    '9. Ending it. Either side can end this at any time. The Agency pays for qualified households sent before it ends.',
    '10. Changes. If the fees or these terms change, you will be asked to sign the new version before your link pays again.',
  ].join('\n')
}

async function rateLimited(supabase: any, key: string, limit: number) {
  const { data, error } = await supabase.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: 60 })
  if (error) { console.error('[RATE_CHECK_PARTNER] rate limit check failed:', error.message); return false }
  return data !== true
}

// ── Earnings (same rules as partnerPay.js) ───────────────────────────────────
// The agency's payout rules (rate_check_partner_rules); no row = these defaults,
// the same as rulesFrom() in partnerPay.js.
type Rules = { requireCallConfirm: boolean; quoteDays: number; expiredDays: number; minPayout: number }
function rulesFrom(row: any): Rules {
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && v != null ? Number(v) : d)
  return {
    requireCallConfirm: row ? row.require_call_confirm !== false : true,
    quoteDays: num(row?.quote_days, QUOTE_DAYS),
    expiredDays: num(row?.expired_days, EXPIRED_DAYS),
    minPayout: num(row?.min_payout, MIN_PAYOUT),
  }
}

const QUALIFIES = (rc: any, now: number, expiredDays = EXPIRED_DAYS) => {
  if (!rc.policy_type || rc.duplicate_of != null || ['pending', 'extract_failed', 'declined'].includes(rc.status)) return false
  if (String(rc.carrier || '').toLowerCase() === 'allstate') return false
  if (rc.expiration_date) { const exp = new Date(rc.expiration_date).getTime(); if (Number.isFinite(exp) && exp < now - expiredDays * DAY) return false }
  return true
}
const QUOTED = (rc: any) => rc.allstate_premium != null || !!rc.quoted_at || ['quoted', 'won', 'lost', 'bound'].includes(rc.status)
// One household = one phone number, address or policy number.
const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function groupHouseholds(scans: any[]): any[][] {
  const parent = scans.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const seen = new Map<string, number>()
  scans.forEach((rc, i) => {
    const keys = [rc.phone && `p:${rc.phone}`, norm(rc.insured_address).length > 8 && `a:${norm(rc.insured_address)}`, norm(rc.policy_number).length > 5 && `n:${norm(rc.policy_number)}`].filter(Boolean) as string[]
    for (const k of keys) { if (seen.has(k)) parent[find(i)] = find(seen.get(k)!); else seen.set(k, i) }
  })
  const groups = new Map<number, any[]>()
  scans.forEach((rc, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r)!.push(rc) })
  return [...groups.values()]
}
// Months in the agency's time zone (Georgia), like the staff Partners tab.
const monthKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).slice(0, 7)

function tierOf(pages: any[]) {
  const has = (types: string[]) => pages.some(p => types.includes(p.policy_type))
  if (has(['auto']) && has(['home', 'condo'])) return { tier: 'auto_home', base: 2 }
  if (has(['auto']) && has(['renters'])) return { tier: 'auto_renters', base: 2 }
  if (has(['home', 'condo'])) return { tier: 'home_only', base: 1 }
  if (has(['auto'])) return { tier: 'auto_only', base: 1 }
  if (has(['renters'])) return { tier: 'renters_only', base: 1 }
  return { tier: null, base: 0 }
}

// Households that pay under the agency's rules (replied Y, or quoted / quoteDays old);
// pending ones aren't listed yet.
function earnings(scans: any[], schedule: Record<string, number>, cap: number | null, rules: Rules) {
  const now = Date.now()
  const hh = groupHouseholds(scans).map(list => {
    const pages = list.filter(rc => QUALIFIES(rc, now, rules.expiredDays)).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const { tier, base } = tierOf(pages)
    if (!tier) return null
    const extras = Math.min(EXTRA_LINE_CAP, Math.max(0, pages.length - base))
    return {
      first_name: (list.find(s => s.first_name)?.first_name || 'Someone').split(/\s+/)[0],
      tier, label: LABEL[tier] + (extras ? ` + ${extras} extra` : ''),
      fee: schedule[tier] + extras * schedule.extra_line,
      firstAt: pages[0].created_at, month: monthKey(pages[0].created_at),
      pending: rules.requireCallConfirm
        ? !list.some((rc: any) => !!rc.call_confirmed_at)
        : !list.some(QUOTED) && now - new Date(pages[0].created_at).getTime() < rules.quoteDays * DAY,
    }
  }).filter(Boolean) as any[]
  const months: Record<string, any[]> = {}
  for (const h of hh.sort((a, b) => a.firstAt.localeCompare(b.firstAt))) (months[h.month] ||= []).push(h)
  return Object.entries(months).map(([month, list]) => {
    // The cap counts every qualifying household in arrival order (pending ones hold their place), like the staff tab.
    const rows = list.map((h, i) => ({ ...h, fee: cap && i >= cap ? 0 : h.fee, over_cap: !!(cap && i >= cap) }))
      .filter(h => !h.pending)
      .map(h => ({ first_name: h.first_name, label: h.label, fee: h.fee, over_cap: h.over_cap, at: h.firstAt }))
    return { month, households: rows.length, earned: rows.reduce((t, r) => t + r.fee, 0), rows: rows.reverse() }
  }).filter(m => m.households > 0).sort((a, b) => b.month.localeCompare(a.month))
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, cors)

  const clientIp = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  if (await rateLimited(supabase, `rate_check_partner:${clientIp}`, 60)) return json({ error: 'Too many requests. Try again in a minute.' }, 429, cors)

  let body: any
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON body' }, 400, cors) }

  // ── Apply to be a partner (public, no token) ──
  if (body?.mode === 'apply') {
    // "Are you an Allstate customer?" then, if yes, "Is Cam Wiley Agency your agent?"
    const CUSTOMER: Record<string, string> = {
      agency: 'Cam Wiley Agency customer', allstate_other: 'Allstate customer with another agent',
      allstate_unsure: 'Allstate customer, agent unknown', no: 'Not with Allstate',
    }
    const { data: ok } = await supabase.rpc('rate_limit_hit', { p_key: `partner_apply:${clientIp}`, p_limit: 5, p_window_seconds: 3600 })
    if (ok !== true) return json({ error: 'Too many applications from here. Try again later.' }, 429, cors)
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) || null : null)
    const firstName = text(body.first_name, 60)
    const phone = String(body.phone || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
    const email = text(body.email, 160)?.toLowerCase() || null
    if (!firstName) return json({ error: 'Add your first name.' }, 400, cors)
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return json({ error: 'Enter a 10-digit US mobile number.' }, 400, cors)
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'That email doesn’t look right.' }, 400, cors)
    const { data: agency } = await supabase.from('agencies').select('id').eq('is_default', true).limit(1).maybeSingle()
    if (!agency) return json({ error: 'Something went wrong. Try again.' }, 500, cors)
    // Applied already (same number, still open)? Don't make a second one.
    const { data: open } = await supabase.from('rate_check_partner_applications').select('id')
      .eq('agency_id', agency.id).eq('phone', phone).eq('status', 'new').limit(1)
    if (open?.length) return json({ applied: true }, 200, cors)
    const lastName = text(body.last_name, 60)
    const { error: insErr } = await supabase.from('rate_check_partner_applications').insert({
      agency_id: agency.id, first_name: firstName, last_name: lastName, phone, email,
      is_customer: CUSTOMER[body.is_customer] ? body.is_customer : null,
      audience: text(body.audience, 60), source: text(body.source, 40) || 'drivers_ed',
      ip_address: clientIp !== 'unknown' ? clientIp : null,
    })
    if (insErr) { console.error('[RATE_CHECK_PARTNER] apply insert failed:', insErr.message); return json({ error: 'Something went wrong. Try again.' }, 500, cors) }
    const { data: principals } = await supabase.from('agency_memberships').select('user_id')
      .eq('agency_id', agency.id).eq('status', 'active').eq('agency_role', 'principal')
    const name = [firstName, lastName].filter(Boolean).join(' ')
    if (principals?.length) {
      await supabase.from('notifications').insert(principals.map((m: any) => ({
        user_id: m.user_id, type: 'PARTNER_APPLICATION', title: `${name} wants to be a referral partner`,
        message: `${CUSTOMER[body.is_customer] || 'Didn’t say if they’re with Allstate'} · from Drivers Ed. Add them in Rate Checks → Partners.`,
        metadata: { phone },
      })))
    }
    return json({ applied: true }, 200, cors)
  }

  const token = String(body?.token || '').replace(/[^a-f0-9]/gi, '').toLowerCase()
  if (token.length !== 48) return json({ error: 'This link isn’t valid.' }, 404, cors)

  const { data: p } = await supabase.from('rate_check_promoters')
    .select('id, agency_id, name, code, active, monthly_cap, agreement_version, agreement_signed_at, photo_url, photo_consent_at, w9_received_at, w9_tin_type, w9_tin_last4, mailing_address, mailing_city_state_zip')
    .eq('portal_token', token).maybeSingle()
  if (!p) return json({ error: 'This link isn’t valid.' }, 404, cors)

  const [{ data: agency }, { data: rateRows }, { data: rulesRow }] = await Promise.all([
    supabase.from('agencies').select('name, brand_name').eq('id', p.agency_id).single(),
    supabase.from('rate_check_promoter_rates').select('tier, amount').eq('agency_id', p.agency_id),
    supabase.from('rate_check_partner_rules').select('*').eq('agency_id', p.agency_id).maybeSingle(),
  ])
  const rules = rulesFrom(rulesRow)
  const schedule: Record<string, number> = { ...Object.fromEntries(TIERS.map(([k, , fee]) => [k, fee])), extra_line: EXTRA_LINE_FEE }
  for (const r of rateRows || []) if (r.tier in schedule) schedule[r.tier] = Number(r.amount)
  const agencyName = agency?.name || agency?.brand_name || 'the Agency'
  const text = agreementText(agencyName, p.name, schedule, p.monthly_cap)
  const signed = p.agreement_version === AGREEMENT_VERSION && !!p.agreement_signed_at
  const cleared = signed || !AGREEMENT_REQUIRED // past the agreement gate (or there isn't one yet)

  if (body.mode === 'sign') {
    if (!AGREEMENT_REQUIRED) return json({ error: 'There’s no agreement to sign yet.' }, 409, cors)
    if (signed) return json({ signed: true }, 200, cors)
    const signedName = String(body.signed_name || '').replace(/\s+/g, ' ').trim()
    if (body.accept !== true) return json({ error: 'Tick the box to agree.' }, 400, cors)
    if (signedName.length < 3 || !signedName.includes(' ')) return json({ error: 'Type your full legal name, first and last.' }, 400, cors)
    if (!p.active) return json({ error: 'This partner link is paused. Contact the agency.' }, 409, cors)
    const now = new Date().toISOString()
    const { error: insErr } = await supabase.from('rate_check_promoter_agreements').insert({
      agency_id: p.agency_id, promoter_id: p.id, version: AGREEMENT_VERSION, agreement_text: text,
      signed_name: signedName.slice(0, 120), signed_at: now,
      ip_address: clientIp !== 'unknown' ? clientIp : null, user_agent: (req.headers.get('user-agent') || '').slice(0, 512),
    })
    if (insErr) { console.error('[RATE_CHECK_PARTNER] sign failed:', insErr.message); return json({ error: 'Something went wrong. Please try again.' }, 500, cors) }
    await supabase.from('rate_check_promoters').update({ agreement_version: AGREEMENT_VERSION, agreement_signed_at: now }).eq('id', p.id)
    return json({ signed: true }, 200, cors)
  }

  if (body.mode === 'photo' || body.mode === 'photo_remove') {
    if (!cleared) return json({ error: 'Sign the agreement first.' }, 409, cors)
    const path = `${p.agency_id}/${p.id}.jpg`
    if (body.mode === 'photo_remove') {
      await supabase.storage.from('partner-photos').remove([path])
      await supabase.from('rate_check_promoters').update({ photo_url: null, photo_consent_at: null }).eq('id', p.id)
      return json({ photo_url: null }, 200, cors)
    }
    if (body.consent !== true) return json({ error: 'Tick the box to show your photo.' }, 400, cors)
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''))
    if (!m) return json({ error: 'That photo couldn’t be read. Try another.' }, 400, cors)
    const bytes = Uint8Array.from(atob(m[1]), ch => ch.charCodeAt(0))
    if (bytes.length > 1048576 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return json({ error: 'That photo couldn’t be read. Try another.' }, 400, cors)
    }
    const { error: upErr } = await supabase.storage.from('partner-photos').upload(path, bytes, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) { console.error('[RATE_CHECK_PARTNER] photo upload failed:', upErr.message); return json({ error: 'Something went wrong. Please try again.' }, 500, cors) }
    const { data: { publicUrl } } = supabase.storage.from('partner-photos').getPublicUrl(path)
    const photoUrl = `${publicUrl}?v=${Date.now()}`
    await supabase.from('rate_check_promoters').update({ photo_url: photoUrl, photo_consent_at: new Date().toISOString() }).eq('id', p.id)
    return json({ photo_url: photoUrl }, 200, cors)
  }

  if (body.mode === 'w9') {
    if (!cleared) return json({ error: 'Sign the agreement first.' }, 409, cors)
    const w9 = checkW9(body)
    if ('error' in w9) return json({ error: w9.error }, 400, cors)
    const when = new Date()
    const [mm, dd, yyyy] = when.toLocaleDateString('en-US', { timeZone: 'America/New_York', month: '2-digit', day: '2-digit', year: 'numeric' }).split('/')
    let pdf: Uint8Array
    try {
      pdf = await fillW9(w9, { agency: agencyName, mm, dd, yyyy, ip: clientIp, when })
    } catch (err) {
      console.error('[RATE_CHECK_PARTNER] w9 fill failed:', (err as Error).message)
      return json({ error: 'Something went wrong making the form. Please try again.' }, 500, cors)
    }
    const path = `${p.agency_id}/${p.id}/w9-${when.getTime()}.pdf`
    const { error: upErr } = await supabase.storage.from('partner-w9').upload(path, pdf, { contentType: 'application/pdf', upsert: false })
    if (upErr) { console.error('[RATE_CHECK_PARTNER] w9 upload failed:', upErr.message); return json({ error: 'Something went wrong. Please try again.' }, 500, cors) }
    const row = {
      w9_received_at: when.toISOString(), w9_tin_type: w9.tin_type, w9_tin_last4: w9.tin.slice(-4),
      w9_tax_class: w9.tax_class === 'llc' ? `llc-${w9.llc_class}` : w9.tax_class, w9_signed_name: w9.signed_name, w9_pdf_path: path,
      // Kept so the next W-9 (an update) starts pre-filled.
      mailing_address: w9.address, mailing_city_state_zip: w9.city_state_zip,
    }
    const { error: rowErr } = await supabase.from('rate_check_promoters').update(row).eq('id', p.id)
    if (rowErr) { console.error('[RATE_CHECK_PARTNER] w9 row update failed:', rowErr.message); return json({ error: 'Something went wrong. Please try again.' }, 500, cors) }
    return json({ w9: { on_file: true, tin_type: w9.tin_type, last4: w9.tin.slice(-4), signed_at: row.w9_received_at, revision: W9_REVISION } }, 200, cors)
  }

  if (body.mode === 'portal') {
    const base = {
      first_name: String(p.name).split(/\s+/)[0], name: p.name, agency_name: agencyName, active: p.active,
      // The draft text is only sent once the agreement is live.
      agreement: { required: AGREEMENT_REQUIRED, version: AGREEMENT_VERSION, text: AGREEMENT_REQUIRED ? text : null, signed, signed_at: signed ? p.agreement_signed_at : null },
      schedule, monthly_cap: p.monthly_cap,
      photo_url: p.photo_consent_at ? p.photo_url : null,
      w9: { on_file: !!p.w9_received_at, tin_type: p.w9_tin_type, last4: p.w9_tin_last4, signed_at: p.w9_received_at, revision: W9_REVISION,
        // Pre-fills the form; the tax ID is never stored or sent back.
        prefill: { address: p.mailing_address || '', city_state_zip: p.mailing_city_state_zip || '' } },
    }
    if (!cleared) return json(base, 200, cors)
    const [{ data: scans }, { data: payouts }] = await Promise.all([
      supabase.from('rate_checks').select('id, phone, first_name, policy_type, status, duplicate_of, created_at, carrier, expiration_date, insured_address, policy_number, allstate_premium, quoted_at, call_confirmed_at')
        .eq('promoter_id', p.id).order('created_at', { ascending: true }).limit(5000),
      supabase.from('rate_check_promoter_payouts').select('period, amount, paid_at').eq('promoter_id', p.id),
    ])
    const paid = Object.fromEntries((payouts || []).map((x: any) => [String(x.period).slice(0, 7), { amount: Number(x.amount), paid_at: x.paid_at }]))
    // Only first names and what each household sent: no phone numbers, no quotes or outcomes.
    const months = earnings(scans || [], schedule, p.monthly_cap, rules).map(m => ({ ...m, paid: paid[m.month] || null }))
    return json({ ...base, code: p.code, months }, 200, cors)
  }

  return json({ error: 'Unknown mode' }, 400, cors)
})

// ── W-9 ────────────────────────────────────────────────────────────────────────
// Same rules as src/pages/components/rate-checks/w9.js, re-checked here.
const TAX_CLASSES = ['individual', 'c_corp', 's_corp', 'partnership', 'trust', 'llc', 'other']
const CLASS_BOX: Record<string, number> = { individual: 0, c_corp: 1, s_corp: 2, partnership: 3, trust: 4, llc: 5, other: 6 }
type W9 = { name: string; business_name: string | null; tax_class: string; llc_class: string | null; other_text: string | null; address: string; city_state_zip: string; tin_type: 'ssn' | 'ein'; tin: string; signed_name: string }

function checkW9(b: any): W9 | { error: string } {
  const clean = (v: unknown, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  const name = clean(b.name), address = clean(b.address), csz = clean(b.city_state_zip), signed = clean(b.signed_name)
  const tin = String(b.tin ?? '').replace(/\D/g, '')
  const tinType = b.tin_type === 'ein' ? 'ein' : b.tin_type === 'ssn' ? 'ssn' : null
  if (b.accept !== true) return { error: 'Tick the box to certify.' }
  if (name.length < 3) return { error: 'Enter the name that goes on your tax return.' }
  if (!TAX_CLASSES.includes(b.tax_class)) return { error: 'Choose how you file.' }
  if (b.tax_class === 'llc' && !['C', 'S', 'P'].includes(b.llc_class)) return { error: 'Choose how the LLC is taxed.' }
  if (b.tax_class === 'other' && !clean(b.other_text)) return { error: 'Say what kind of entity.' }
  if (address.length < 5) return { error: 'Enter your street address.' }
  if (!/^.{2,},?\s*[A-Za-z]{2}\s+\d{5}(-\d{4})?$/.test(csz)) return { error: 'City, state and ZIP, like “Atlanta, GA 30303”.' }
  if (!tinType) return { error: 'Choose SSN or EIN.' }
  if (tin.length !== 9 || /^(\d)\1{8}$/.test(tin) || tin === '123456789') return { error: 'That doesn’t look like a real number.' }
  if (tinType === 'ssn') {
    const area = tin.slice(0, 3)
    if (area === '000' || area === '666' || area >= '900' || tin.slice(3, 5) === '00' || tin.slice(5) === '0000') return { error: 'That isn’t a valid SSN.' }
  } else if (tin.startsWith('00')) return { error: 'An EIN can’t start with 00.' }
  if (signed.length < 3 || !signed.includes(' ')) return { error: 'Type your full name as your signature.' }
  return {
    name, business_name: clean(b.business_name) || null, tax_class: b.tax_class, llc_class: b.tax_class === 'llc' ? b.llc_class : null,
    other_text: b.tax_class === 'other' ? clean(b.other_text, 60) : null, address, city_state_zip: csz, tin_type: tinType, tin, signed_name: signed,
  }
}

// Fills the IRS form's own fields (names from the blank PDF), draws the typed
// signature and an e-sign line in the Sign Here box, then flattens it.
async function fillW9(w: W9, ctx: { agency: string; mm: string; dd: string; yyyy: string; ip: string; when: Date }) {
  const doc = await PDFDocument.load(await loadBlankW9())
  const form = doc.getForm()
  const P = 'topmostSubform[0].Page1[0].'
  const text = (f: string, v: string | null) => { if (v) form.getTextField(P + f).setText(v) }
  text('f1_01[0]', w.name)
  text('f1_02[0]', w.business_name)
  form.getCheckBox(`${P}Boxes3a-b_ReadOrder[0].c1_1[${CLASS_BOX[w.tax_class]}]`).check()
  if (w.tax_class === 'llc') text('Boxes3a-b_ReadOrder[0].f1_03[0]', w.llc_class)
  if (w.tax_class === 'other') text('Boxes3a-b_ReadOrder[0].f1_04[0]', w.other_text)
  text('Address_ReadOrder[0].f1_07[0]', w.address)
  text('Address_ReadOrder[0].f1_08[0]', w.city_state_zip)
  text('f1_09[0]', ctx.agency)
  form.getTextField(P + 'f1_09[0]').acroField.setDefaultAppearance('/Helv 9 Tf 0 g') // otherwise auto-size fills the box
  if (w.tin_type === 'ssn') { text('f1_11[0]', w.tin.slice(0, 3)); text('f1_12[0]', w.tin.slice(3, 5)); text('f1_13[0]', w.tin.slice(5)) }
  else { text('f1_14[0]', w.tin.slice(0, 2)); text('f1_15[0]', w.tin.slice(2)) }
  const page = doc.getPages()[0]
  const sig = await doc.embedFont(StandardFonts.HelveticaOblique)
  const small = await doc.embedFont(StandardFonts.Helvetica)
  // Where the Sign Here box sits depends on the revision: the June 2026 draft (which has
  // date fields) puts it near the foot of the page; the March 2024 form puts it mid-page
  // with the instructions below and a plain Date box.
  const hasDateFields = !!form.getFieldMaybe(P + 'f1_16[0]')
  const sigY = hasDateFields ? 92 : 196
  page.drawText(w.signed_name, { x: 150, y: sigY, size: 13, font: sig, color: rgb(0.05, 0.1, 0.4) })
  if (hasDateFields) { text('f1_16[0]', ctx.mm); text('f1_17[0]', ctx.dd); text('f1_18[0]', ctx.yyyy) }
  else page.drawText(`${ctx.mm}/${ctx.dd}/${ctx.yyyy}`, { x: 468, y: sigY, size: 11, font: small, color: rgb(0.05, 0.1, 0.4) })
  page.drawText(`Electronically signed by ${w.signed_name} on ${ctx.mm}/${ctx.dd}/${ctx.yyyy} (${ctx.when.toISOString()}) from IP ${ctx.ip} via the ${ctx.agency} partner portal.`,
    { x: 112, y: sigY - 11, size: 5, font: small, color: rgb(0.3, 0.3, 0.3) })
  form.flatten()
  return await doc.save()
}
