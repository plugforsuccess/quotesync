// Supabase Edge Function: renewal-outreach-sweep
// POST /functions/v1/renewal-outreach-sweep
//
// The single pre-renewal outreach campaign (replaces the old instant-trigger
// "Campaign B"). Runs daily via pg_cron. Its job is to make first contact
// BEFORE the customer is notified of their renewal.
//
// Timing (Allstate GA): the renewal + new rate lands in the agency queue at
// 45 DTE; the customer isn't notified until 31 DTE. That 45→31 gap is our
// blackout window to reach them first. This sweep fires once per case at the
// TOP of the window (45→32 DTE) so a no-answer still leaves the human ~13 days
// to follow up before the notice goes out.
//
// Branch on rate change:
//   - premium increase > 8%  → deflection call: honest "your rate moved, let's
//     review", warm transfer to a licensed agent (8am–2pm, weekdays), and the
//     outcome routes to a human (crisis flag or no-answer → Tracy's queue).
//   - flat / decrease        → SHELVED. A friendly review/cross-sell touch is a
//     growth play, not retention; enable later via CALL_FLAT_RENEWALS.
//
// Compliant: discloses it's an automated assistant, never quotes/binds, honors
// opt-out. All pre-call gates apply (consent, DNC, call window, single-fire
// lock, recent-contact de-dup). The call_ended callback is bland-renewal-webhook.
// Auth: service-role bearer, or x-retention-secret == RETENTION_WEBHOOK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars, formatPhoneUS } from '../_shared/twilio.ts'

const BLAND_API_URL = 'https://api.bland.ai/v1/calls'
const PREMIUM_DELTA_THRESHOLD_PCT = 8
const WINDOW_MIN_DTE = 32           // stop firing once the case is closer than this
const WINDOW_MAX_DTE = 45           // start firing once the renewal lands in the queue
const SINGLE_FIRE_LOOKBACK_DAYS = 20 // one bot call per renewal cycle
const RECENT_CONTACT_HOURS = 48     // don't dial if a human/AI just contacted them
const BATCH_LIMIT = 25
const CALL_DELAY_MS = 4_000

// Flat / non-increase renewals are intentionally NOT called (shelved). Flip to
// true (and widen the query below) only to run a cross-sell / discount-review
// touch — that's offense, not churn defense.
const CALL_FLAT_RENEWALS = false

// Restrict to 8:00 AM – 2:00 PM recipient-local time, weekdays only. Ends at 2pm
// so every warm transfer can complete before the licensed agent leaves at 3pm.
// This book is Georgia-based, so recipient-local == US Eastern.
function isWithinCallWindowEastern(): boolean {
  const now = new Date()
  const year = now.getUTCFullYear()
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1))
  marchSecondSunday.setUTCDate(marchSecondSunday.getUTCDate() + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7)
  const novFirstSunday = new Date(Date.UTC(year, 10, 1))
  novFirstSunday.setUTCDate(novFirstSunday.getUTCDate() + ((7 - novFirstSunday.getUTCDay()) % 7))
  const dstStart = new Date(marchSecondSunday.getTime() + 7 * 60 * 60 * 1000)
  const dstEnd = new Date(novFirstSunday.getTime() + 6 * 60 * 60 * 1000)
  const isDST = now >= dstStart && now < dstEnd
  const offsetHours = isDST ? 4 : 5
  const easternHour = (now.getUTCHours() - offsetHours + 24) % 24
  const easternDay = now.getUTCDay()
  if (easternDay === 0 || easternDay === 6) return false // no weekend calls
  return easternHour >= 8 && easternHour < 14
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
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function ymd(d: Date): string {
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  // ── Auth: service-role bearer (cron) OR shared retention secret ────────────
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const retentionSecret = Deno.env.get('RETENTION_WEBHOOK_SECRET') || ''
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const providedSecret = req.headers.get('x-retention-secret') || ''
  if (!((serviceRoleKey && bearer === serviceRoleKey) || (retentionSecret && providedSecret === retentionSecret))) {
    return jsonResponse({ error: 'Forbidden' }, 403)
  }

  const missingVar = checkRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (missingVar) return jsonResponse({ error: `Missing config: ${missingVar}` }, 503)

  // Window guard up front — the cron may run any time; only dial in-window.
  if (!isWithinCallWindowEastern()) {
    return jsonResponse({ skipped: true, reason: 'outside_call_window' })
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
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
    // Flat renewals are excluded unless CALL_FLAT_RENEWALS is enabled.
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

    if (!CALL_FLAT_RENEWALS) {
      query = query.gt('premium_change_pct', PREMIUM_DELTA_THRESHOLD_PCT)
    }

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
        consentMap.set(`${c.agency_id}:${c.customer_phone}`, {
          autodial_consent: !!c.autodial_consent, dnc: !!c.dnc,
        })
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
      if (!e164) { blocked.push({ id: rc.id, reason: 'invalid_phone' }); continue }

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
          // Rate limited — release this lock and stop; remaining cases retry tomorrow.
          await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rc.id)
          rateLimited = true
          break
        }
        if (!res.ok) {
          const errText = (await res.text()).slice(0, 300)
          if (res.status >= 500) {
            await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rc.id)
          }
          console.error(`[RENEWAL_SWEEP] Bland ${res.status} for ${rc.id}: ${errText}`)
          blocked.push({ id: rc.id, reason: `bland_error_${res.status}` })
          continue
        }

        const { call_id } = await res.json()
        queued.push(rc.id)

        // Attribution + state (best-effort).
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
        blocked.push({ id: rc.id, reason: 'network_error' })
      }
    }

    console.log(`[RENEWAL_SWEEP] ${queued.length} queued, ${blocked.length} blocked, rate_limited=${rateLimited}`)
    return jsonResponse({
      success: true,
      window: { from_dte: WINDOW_MIN_DTE, to_dte: WINDOW_MAX_DTE },
      queued: queued.length,
      blocked: blocked.length,
      rate_limited: rateLimited,
      details: { blocked },
    })
  } catch (err) {
    console.error('[RENEWAL_SWEEP] Unhandled error:', err)
    return jsonResponse({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
