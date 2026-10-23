// Supabase Edge Function: rate-check-partner
// POST /functions/v1/rate-check-partner   (verify_jwt = false — opened by partners, who have no login)
//
// The partner portal (/partner/TOKEN). The token is a long secret the agency sends the
// partner privately; it is not the public share code.
//   { mode: 'portal', token }                       → who they are, the agreement, and (once
//                                                     signed) their share code and earnings
//   { mode: 'sign', token, signed_name, accept }    → records the signature; from then on
//                                                     rate-check tags scans from their link
//   { mode: 'photo', token, image, consent }        → (signed partners) their photo for their
//                                                     link's landing page; image is a JPEG data URL
//   { mode: 'photo_remove', token }                 → takes the photo off their link
// The agreement text below is a DRAFT for the agency's attorney and Allstate compliance
// to review. Changing it means bumping AGREEMENT_VERSION, which asks every partner to
// sign again before their link pays.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
const QUALIFIES = (rc: any, now: number) => {
  if (!rc.policy_type || rc.duplicate_of != null || ['pending', 'extract_failed', 'declined'].includes(rc.status)) return false
  if (String(rc.carrier || '').toLowerCase() === 'allstate') return false
  if (rc.expiration_date) { const exp = new Date(rc.expiration_date).getTime(); if (Number.isFinite(exp) && exp < now - EXPIRED_DAYS * DAY) return false }
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

// Households that pay (quoted, or QUOTE_DAYS old); pending ones aren't listed yet.
function earnings(scans: any[], schedule: Record<string, number>, cap: number | null) {
  const now = Date.now()
  const hh = groupHouseholds(scans).map(list => {
    const pages = list.filter(rc => QUALIFIES(rc, now)).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const { tier, base } = tierOf(pages)
    if (!tier) return null
    const extras = Math.min(EXTRA_LINE_CAP, Math.max(0, pages.length - base))
    return {
      first_name: (list.find(s => s.first_name)?.first_name || 'Someone').split(/\s+/)[0],
      tier, label: LABEL[tier] + (extras ? ` + ${extras} extra` : ''),
      fee: schedule[tier] + extras * schedule.extra_line,
      firstAt: pages[0].created_at, month: monthKey(pages[0].created_at),
      pending: !list.some(QUOTED) && now - new Date(pages[0].created_at).getTime() < QUOTE_DAYS * DAY,
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
  const token = String(body?.token || '').replace(/[^a-f0-9]/gi, '').toLowerCase()
  if (token.length !== 48) return json({ error: 'This link isn’t valid.' }, 404, cors)

  const { data: p } = await supabase.from('rate_check_promoters')
    .select('id, agency_id, name, code, active, monthly_cap, agreement_version, agreement_signed_at, photo_url, photo_consent_at')
    .eq('portal_token', token).maybeSingle()
  if (!p) return json({ error: 'This link isn’t valid.' }, 404, cors)

  const [{ data: agency }, { data: rateRows }] = await Promise.all([
    supabase.from('agencies').select('name, brand_name').eq('id', p.agency_id).single(),
    supabase.from('rate_check_promoter_rates').select('tier, amount').eq('agency_id', p.agency_id),
  ])
  const schedule: Record<string, number> = { ...Object.fromEntries(TIERS.map(([k, , fee]) => [k, fee])), extra_line: EXTRA_LINE_FEE }
  for (const r of rateRows || []) if (r.tier in schedule) schedule[r.tier] = Number(r.amount)
  const agencyName = agency?.name || agency?.brand_name || 'the Agency'
  const text = agreementText(agencyName, p.name, schedule, p.monthly_cap)
  const signed = p.agreement_version === AGREEMENT_VERSION && !!p.agreement_signed_at

  if (body.mode === 'sign') {
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
    if (!signed) return json({ error: 'Sign the agreement first.' }, 409, cors)
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

  if (body.mode === 'portal') {
    const base = {
      first_name: String(p.name).split(/\s+/)[0], agency_name: agencyName, active: p.active,
      agreement: { version: AGREEMENT_VERSION, text, signed, signed_at: signed ? p.agreement_signed_at : null },
      schedule, monthly_cap: p.monthly_cap,
      photo_url: p.photo_consent_at ? p.photo_url : null,
    }
    if (!signed) return json(base, 200, cors)
    const [{ data: scans }, { data: payouts }] = await Promise.all([
      supabase.from('rate_checks').select('id, phone, first_name, policy_type, status, duplicate_of, created_at, carrier, expiration_date, insured_address, policy_number, allstate_premium, quoted_at')
        .eq('promoter_id', p.id).order('created_at', { ascending: true }).limit(5000),
      supabase.from('rate_check_promoter_payouts').select('period, amount, paid_at').eq('promoter_id', p.id),
    ])
    const paid = Object.fromEntries((payouts || []).map((x: any) => [String(x.period).slice(0, 7), { amount: Number(x.amount), paid_at: x.paid_at }]))
    // Only first names and what each household sent: no phone numbers, no quotes or outcomes.
    const months = earnings(scans || [], schedule, p.monthly_cap).map(m => ({ ...m, paid: paid[m.month] || null }))
    return json({ ...base, code: p.code, months }, 200, cors)
  }

  return json({ error: 'Unknown mode' }, 400, cors)
})
