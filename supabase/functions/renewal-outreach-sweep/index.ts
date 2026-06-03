// Supabase Edge Function: renewal-outreach-sweep
// POST /functions/v1/renewal-outreach-sweep
//
// The single pre-renewal outreach campaign. Two ways to trigger it, one engine:
//   - CRON (service-role / shared secret) → sweeps ALL agencies, strict window.
//   - BUTTON ("Run AI Queue", user JWT)   → sweeps the caller's agency only,
//     with the suppressed/override banner the UI expects.
//
// Its job is to make first contact BEFORE the customer is notified of their
// renewal. Allstate (GA) drops the renewal + new rate into the agency queue at
// 45 DTE but doesn't notify the customer until 31 DTE — so contact is windowed
// to 45→32 DTE, fired once per case at the top of the window so a no-answer
// still leaves the human ~13 days before the notice.
//
// Branch on rate change:
//   - increase ≥ 5%   → deflection call: honest "your renewal's coming, let's
//     review", warm transfer to an available licensed agent, outcome routes to
//     a human (crisis flag or no-answer → the producer's queue).
//   - flat / decrease → SHELVED (CALL_FLAT_RENEWALS) — cross-sell is offense.
//
// Compliant: discloses it's an automated assistant, never quotes/binds, honors
// opt-out. Gates: consent, DNC, call window, single-fire lock, recent-contact
// de-dup. The call_ended callback is bland-renewal-webhook.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars, formatPhoneUS } from '../_shared/twilio.ts'

const BLAND_API_URL = 'https://api.bland.ai/v1/calls'
const PREMIUM_DELTA_THRESHOLD_PCT = 5 // call renewals with an increase of 5% or more
const WINDOW_MIN_DTE = 32           // stop firing once the case is closer than this
const WINDOW_MAX_DTE = 45           // start firing once the renewal lands in the queue
const SINGLE_FIRE_LOOKBACK_DAYS = 20 // one bot call per renewal cycle
const RECENT_CONTACT_HOURS = 48     // don't dial if a human/AI just contacted them
const BATCH_LIMIT = 25
const CALL_DELAY_MS = 4_000

// Flat / non-increase renewals are intentionally NOT called (shelved). Flip to
// true (and the query widens) only to run a cross-sell / discount-review touch.
const CALL_FLAT_RENEWALS = false

// ── Calling-window logic (US Eastern; this book is Georgia-based) ────────────
// Business rule: weekdays, 8:00 AM–2:00 PM, so every warm transfer can complete
// before the licensed agent leaves at 3pm. A manual override (button only) can
// bypass the weekday/holiday/2pm rules but never the TCPA 8am–9pm hard floor.
function easternNow() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1))
  marchSecondSunday.setUTCDate(marchSecondSunday.getUTCDate() + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7)
  const novFirstSunday = new Date(Date.UTC(year, 10, 1))
  novFirstSunday.setUTCDate(novFirstSunday.getUTCDate() + ((7 - novFirstSunday.getUTCDay()) % 7))
  const dstStart = new Date(marchSecondSunday.getTime() + 7 * 60 * 60 * 1000)
  const dstEnd = new Date(novFirstSunday.getTime() + 6 * 60 * 60 * 1000)
  const isDST = now >= dstStart && now < dstEnd
  const offsetMs = (isDST ? 4 : 5) * 60 * 60 * 1000
  const et = new Date(now.getTime() - offsetMs)
  return { hour: et.getUTCHours(), day: et.getUTCDay(), dateStr: et.toISOString().split('T')[0] }
}

function holidayName(dateStr: string, year: number): string | null {
  const fixed: Record<string, string> = {
    [`${year}-01-01`]: "New Year's Day",
    [`${year}-07-04`]: 'Independence Day',
    [`${year}-12-25`]: 'Christmas',
  }
  if (fixed[dateStr]) return fixed[dateStr]
  const mayLast = new Date(Date.UTC(year, 4, 31)); while (mayLast.getUTCDay() !== 1) mayLast.setUTCDate(mayLast.getUTCDate() - 1)
  if (mayLast.toISOString().split('T')[0] === dateStr) return 'Memorial Day'
  const sepFirst = new Date(Date.UTC(year, 8, 1)); while (sepFirst.getUTCDay() !== 1) sepFirst.setUTCDate(sepFirst.getUTCDate() + 1)
  if (sepFirst.toISOString().split('T')[0] === dateStr) return 'Labor Day'
  const nov = new Date(Date.UTC(year, 10, 1)); let t = 0
  while (t < 4) { if (nov.getUTCDay() === 4) t++; if (t < 4) nov.setUTCDate(nov.getUTCDate() + 1) }
  if (nov.toISOString().split('T')[0] === dateStr) return 'Thanksgiving'
  return null
}

// Returns { ok } if clear to dial, else { suppressed, reason, message }.
// `override` is honored only on the button path.
function callWindowStatus(override: boolean): { ok: true } | { ok: false; reason: string; message: string } {
  const { hour, day, dateStr } = easternNow()
  const tcpaOk = hour >= 8 && hour < 21
  if (override) {
    // Manual run: allow off-hours/weekend/holiday, but never outside TCPA hours.
    if (!tcpaOk) return { ok: false, reason: 'tcpa_hours', message: 'Outside legal calling hours (8:00 AM–9:00 PM Eastern). Cannot override.' }
    return { ok: true }
  }
  if (day === 0 || day === 6) return { ok: false, reason: 'weekend', message: 'AI calls run weekdays only. Override to run now anyway.' }
  const hol = holidayName(dateStr, Number(dateStr.slice(0, 4)))
  if (hol) return { ok: false, reason: `holiday:${hol}`, message: `Today is ${hol}; AI calls are paused. Override to run now anyway.` }
  if (!(hour >= 8 && hour < 14)) return { ok: false, reason: 'outside_hours', message: 'Outside the 8:00 AM–2:00 PM weekday calling window. Override to run now anyway.' }
  return { ok: true }
}

// Compliant warm-transfer script. Honest, discloses it is automated, no false
// urgency, no promises of credits, routes all substantive questions to a human.
const DEFLECTION_PROMPT = `You are an automated courtesy assistant calling on behalf of Wiley-Wilson Insurance Agency, an Allstate agency in Conyers, Georgia. You are NOT a licensed agent and you are NOT a human — say so plainly.

STRICT RULES — follow without exception:
1. In your FIRST sentence, clearly state that you are an automated assistant calling from the Wiley-Wilson Allstate agency. Do not imitate a specific named person.
2. State the honest reason for the call: their Allstate policy is coming up for renewal soon and you wanted to proactively reach out so a licensed agent can review it with them before they decide anything. Do NOT invent a pretext (no "verifying mileage," no "forcing credits today").
3. Do NOT quote numbers, promise discounts/credits, or claim you can lower their rate. You cannot and must not make any binding statement. If asked "how much can it be lowered?" answer honestly: "I can't quote that — but a licensed agent can review it with you. Would you like me to connect you now?"
4. If {{transfer_available}} is "true": offer a warm transfer — "I have a licensed agent available now who can go over your options. Would you like me to connect you?" If yes, transfer to {{transfer_number}}. If the transfer is not answered, apologize and offer a scheduled callback instead.
5. If {{transfer_available}} is "false": offer a personal callback from the agency and capture a preferred time. Do not pressure.
6. If the customer says anything like "stop calling," "don't call me," "remove me," or "I don't want to be contacted" — acknowledge, apologize, set variables.opt_out_requested = "true", confirm they'll be removed, and end the call immediately. This is a legal requirement.
7. If a third party (not the named insured) answers, do not share any account details. Ask for a good callback time and end politely.
8. Be brief, warm, and respectful. Never argue. If the customer is upset, acknowledge it, offer a personal callback from a licensed agent, and end the call.
9. Populate the analysis_schema fields accurately at the end of every call.`

const ANALYSIS_SCHEMA = {
  call_outcome: {
    type: 'string',
    description: 'Primary outcome of the call — choose the single best match',
    enum: [
      'confirmed', 'hesitant', 'shopping', 'rate_shock_escalated',
      'callback_scheduled', 'out_of_scope_escalated', 'opt_out_requested',
      'wrong_number', 'third_party_answer', 'voicemail', 'no_answer',
    ],
  },
  customer_intent: {
    type: 'string',
    description: 'Whether the customer plans to renew, is unsure, or is shopping',
    enum: ['will_renew', 'unsure', 'shopping', 'unknown'],
  },
  callback_confirmed: {
    type: 'boolean',
    description: 'True only if the customer explicitly agreed to a personal callback',
  },
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function ymd(d: Date): string { return d.toISOString().split('T')[0] }

// Resolve the trigger mode. CRON: service-role bearer or shared secret → all
// agencies. BUTTON: a user JWT belonging to an active principal/producer → that
// agency only. Anything else → null (forbidden).
async function resolveCaller(req: Request, serviceRoleKey: string): Promise<
  { mode: 'cron'; agencyId: null } | { mode: 'user'; agencyId: string } | null
> {
  const retentionSecret = Deno.env.get('RETENTION_WEBHOOK_SECRET') || ''
  const authHeader = req.headers.get('Authorization') || ''
  const bearer = authHeader.replace('Bearer ', '')
  const providedSecret = req.headers.get('x-retention-secret') || ''
  if ((serviceRoleKey && bearer === serviceRoleKey) || (retentionSecret && providedSecret === retentionSecret)) {
    return { mode: 'cron', agencyId: null }
  }
  if (!bearer) return null
  // User-JWT path: verify the token, then confirm an active principal/producer
  // membership and scope the sweep to that agency.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') || serviceRoleKey,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return null
  const svc = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  const { data: membership } = await svc
    .from('agency_memberships')
    .select('agency_id, agency_role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('agency_role', ['principal', 'producer'])
    .limit(1)
    .maybeSingle()
  if (!membership?.agency_id) return null
  return { mode: 'user', agencyId: membership.agency_id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const missingVar = checkRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (missingVar) return jsonResponse({ error: `Missing config: ${missingVar}` }, 503)
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

  const caller = await resolveCaller(req, serviceRoleKey)
  if (!caller) return jsonResponse({ error: 'Forbidden' }, 403)

  let bodyIn: { override_suppression?: boolean } = {}
  try { bodyIn = await req.json() } catch { /* defaults */ }
  // Override is only meaningful for the manual button path.
  const override = caller.mode === 'user' && bodyIn.override_suppression === true

  // Window / suppression gate.
  const win = callWindowStatus(override)
  if (!win.ok) {
    if (caller.mode === 'user') {
      // Drives the UI's suppressed banner + Override button.
      return jsonResponse({ suppressed: true, reason: win.reason, message: win.message })
    }
    return jsonResponse({ skipped: true, reason: win.reason })
  }

  const blandKey = Deno.env.get('BLAND_AI_API_KEY') || Deno.env.get('BLAND_API_KEY')
  if (!blandKey) {
    console.error('[RENEWAL_SWEEP] BLAND_AI_API_KEY not set')
    return jsonResponse({ error: 'Configuration error', detail: 'missing_bland_key' }, 503)
  }
  const supabase = createClient(SUPABASE_URL, serviceRoleKey)

  const now = new Date()
  const today = ymd(now)
  const windowStart = ymd(new Date(now.getTime() + WINDOW_MIN_DTE * 86400000)) // 32 DTE
  const windowEnd = ymd(new Date(now.getTime() + WINDOW_MAX_DTE * 86400000))   // 45 DTE
  const singleFireCutoff = ymd(new Date(now.getTime() - SINGLE_FIRE_LOOKBACK_DAYS * 86400000))

  try {
    // ── Candidates: rate-increase renewals entering the pre-notice window ────
    let query = supabase
      .from('renewal_cases')
      .select('id, agency_id, customer_name, phone, renewal_date, premium, current_premium, premium_change_pct, customer_group_id, status, human_only, claim_flag, last_retention_call_date, last_contact_date')
      .not('status', 'in', '(confirmed,lost,auto_resolved,unreachable,saved,rewritten)')
      .eq('human_only', false)
      .eq('claim_flag', 'none')
      .gte('renewal_date', windowStart)
      .lte('renewal_date', windowEnd)
      .or(`last_retention_call_date.is.null,last_retention_call_date.lt.${singleFireCutoff}`)
      .order('renewal_date', { ascending: true })
      .limit(BATCH_LIMIT * 3)

    if (caller.mode === 'user') query = query.eq('agency_id', caller.agencyId)
    if (!CALL_FLAT_RENEWALS) query = query.gte('premium_change_pct', PREMIUM_DELTA_THRESHOLD_PCT)

    const { data: candidates, error: fetchErr } = await query
    if (fetchErr) {
      console.error('[RENEWAL_SWEEP] Fetch error:', fetchErr)
      return jsonResponse({ error: 'Failed to fetch candidates', details: fetchErr.message }, 500)
    }

    // ── Consent records for the candidate phones (one batched read) ──────────
    const phones = (candidates || []).map(c => c.phone).filter(Boolean) as string[]
    const consentMap = new Map<string, { autodial_consent: boolean; dnc: boolean }>()
    if (phones.length > 0) {
      const { data: consents } = await supabase
        .from('customer_consent')
        .select('customer_phone, autodial_consent, dnc, agency_id')
        .in('customer_phone', phones)
      for (const c of consents || []) {
        consentMap.set(`${c.agency_id}:${c.customer_phone}`, { autodial_consent: !!c.autodial_consent, dnc: !!c.dnc })
      }
    }

    // Cache warm-transfer numbers per agency so we don't re-query per row.
    const transferByAgency = new Map<string, string | null>()
    async function transferNumberFor(agencyId: string): Promise<string | null> {
      if (transferByAgency.has(agencyId)) return transferByAgency.get(agencyId)!
      let num: string | null = null
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/get-available-agents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({ agency_id: agencyId }),
        })
        if (r.ok) { const { agents = [] } = await r.json(); num = agents[0]?.transfer_phone ?? null }
      } catch (e) {
        console.warn('[RENEWAL_SWEEP] get-available-agents failed:', e)
      }
      num = num || Deno.env.get('PRODUCER_TRANSFER_NUMBER') || null
      transferByAgency.set(agencyId, num)
      return num
    }

    const queued: string[] = []
    const blocked: Array<{ id: string; reason: string }> = []
    const skipped: Array<{ id: string; reason: string }> = []
    let rateLimited = false

    for (const rc of (candidates || [])) {
      if (queued.length >= BATCH_LIMIT) break

      // Consent gate (TCPA): explicit autodial consent, not DNC.
      const consent = rc.phone ? consentMap.get(`${rc.agency_id}:${rc.phone}`) : null
      if (!consent?.autodial_consent || consent?.dnc) { blocked.push({ id: rc.id, reason: 'no_consent_or_dnc' }); continue }

      // De-dup: don't dial if a human or prior AI call touched them recently.
      if (rc.last_contact_date) {
        const hrs = (now.getTime() - new Date(rc.last_contact_date).getTime()) / 3_600_000
        if (hrs < RECENT_CONTACT_HOURS) { blocked.push({ id: rc.id, reason: 'recent_contact' }); continue }
      }

      const e164 = rc.phone ? formatPhoneUS(rc.phone) : null
      if (!e164) { skipped.push({ id: rc.id, reason: 'invalid_phone' }); continue }

      // Single-fire lock — claim atomically; only the first run this cycle wins.
      const { data: claimed, error: claimErr } = await supabase
        .from('renewal_cases')
        .update({ last_retention_call_date: today })
        .eq('id', rc.id)
        .or(`last_retention_call_date.is.null,last_retention_call_date.lt.${singleFireCutoff}`)
        .select('id')
      if (claimErr || !claimed || claimed.length === 0) { blocked.push({ id: rc.id, reason: 'already_fired' }); continue }

      const transferNumber = await transferNumberFor(rc.agency_id)
      const transferAvailable = !!transferNumber
      const firstName = (rc.customer_name || '').split(' ')[0]
      const delta = Number(rc.premium_change_pct ?? 0)
      const deltaDollars = (rc.premium != null && rc.current_premium != null)
        ? (Number(rc.premium) - Number(rc.current_premium)).toFixed(2) : ''

      const payload: Record<string, unknown> = {
        phone_number: e164,
        from: Deno.env.get('TWILIO_PHONE_NUMBER') || undefined,
        task: DEFLECTION_PROMPT,
        voice: 'maya',
        language: 'en-US',
        max_duration: 6,
        record: true,
        webhook: `${SUPABASE_URL}/functions/v1/bland-renewal-webhook`,
        webhook_events: ['call_ended'],
        analysis_schema: ANALYSIS_SCHEMA,
        request_data: {
          first_name: firstName,
          transfer_available: String(transferAvailable),
          transfer_number: transferNumber || '',
          premium_delta_pct: String(delta),
        },
        metadata: {
          policy_id: rc.id,
          agency_id: rc.agency_id,
          customer_group_id: rc.customer_group_id || null,
          customer_first_name: firstName,
          customer_name: rc.customer_name,
          renewal_date: rc.renewal_date,
          premium_change_pct: String(delta),
          premium_change_dollars: deltaDollars,
          campaign_type: 'rate_deflection',
        },
        ...(transferAvailable ? { transfer_phone_number: transferNumber } : {}),
      }

      try {
        const res = await fetch(BLAND_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${blandKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (res.status === 429 || res.status === 503) {
          await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rc.id)
          rateLimited = true
          break
        }
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 300)
          if (res.status >= 500) await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rc.id)
          console.error(`[RENEWAL_SWEEP] Bland ${res.status} for ${rc.id}: ${errText}`)
          skipped.push({ id: rc.id, reason: `bland_error_${res.status}` })
          continue
        }

        const { call_id } = await res.json()
        queued.push(rc.id)

        await supabase.from('ai_call_log').upsert({
          agency_id: rc.agency_id, policy_id: rc.id, bland_call_id: call_id,
          campaign_type: 'rate_deflection', call_type: 'rate_deflection',
          called_at: new Date().toISOString(),
        }, { onConflict: 'bland_call_id' })
          .then(({ error }) => { if (error) console.error('[RENEWAL_SWEEP] ai_call_log error:', error) })

        await supabase.from('renewal_cases')
          .update({ retention_status: 'at_risk', updated_at: new Date().toISOString() })
          .eq('id', rc.id)
          .then(({ error }) => { if (error) console.error('[RENEWAL_SWEEP] retention_status error:', error) })

        if (queued.length < BATCH_LIMIT) await new Promise(r => setTimeout(r, CALL_DELAY_MS))
      } catch (netErr) {
        await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rc.id)
        console.error(`[RENEWAL_SWEEP] Network error for ${rc.id}:`, netErr)
        skipped.push({ id: rc.id, reason: 'network_error' })
      }
    }

    console.log(`[RENEWAL_SWEEP] mode=${caller.mode} ${queued.length} queued, ${blocked.length} blocked, ${skipped.length} skipped, rate_limited=${rateLimited}`)
    return jsonResponse({
      success: true,
      mode: caller.mode,
      window: { from_dte: WINDOW_MIN_DTE, to_dte: WINDOW_MAX_DTE },
      queued: queued.length,
      blocked: blocked.length,
      skipped: skipped.length,
      rate_limited: rateLimited,
      details: { blocked, skipped },
    })
  } catch (err) {
    console.error('[RENEWAL_SWEEP] Unhandled error:', err)
    return jsonResponse({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
