// Supabase Edge Function: trigger-rate-deflection
// POST /functions/v1/trigger-rate-deflection
//
// Campaign B — High-Rate Deflection & Warm Transfer.
// Triggered instantly by a Supabase Database Webhook on renewal_cases when a
// renewal arrives (or updates) with a premium increase delta > 8%. Places a
// single compliant Bland.ai call that:
//   - identifies itself as an automated assistant in its first sentence,
//   - honestly explains the renewal premium went up,
//   - offers to connect the customer to a LICENSED agent (warm transfer) to
//     review their options — it never quotes, promises credits, or invents a
//     pretext,
//   - honors opt-out immediately.
//
// All pre-call gates from the renewal queue apply: explicit autodial consent,
// no DNC, calling-window hours, and a same-day idempotency lock so a retried
// webhook cannot double-dial.
//
// The call_ended callback is handled by the existing bland-renewal-webhook.
// Auth: service-role bearer, or x-retention-secret == RETENTION_WEBHOOK_SECRET.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars, formatPhoneUS } from '../_shared/twilio.ts'

const BLAND_API_URL = 'https://api.bland.ai/v1/calls'
const PREMIUM_DELTA_THRESHOLD_PCT = 8

// Restrict to 8:00 AM – 2:00 PM recipient-local time. The window ends at 2pm so
// every warm transfer can complete before the licensed agent (Tracy) leaves at
// 3pm — there's no point dialing a deflection call we can't hand off live.
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
const RATE_DEFLECTION_PROMPT = `You are an automated courtesy assistant calling on behalf of Wiley-Wilson Insurance Agency, an Allstate agency in Conyers, Georgia. You are NOT a licensed agent and you are NOT a human — say so plainly.

STRICT RULES — follow without exception:
1. In your FIRST sentence, clearly state that you are an automated assistant calling from the Wiley-Wilson Allstate agency. Do not imitate a specific named person.
2. State the honest reason for the call: you noticed their upcoming Allstate renewal premium went up, and the agency wanted to proactively reach out so a licensed agent can review their options with them before they decide anything. Do NOT invent a pretext (no "verifying mileage," no "forcing credits today").
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

// Supabase DB webhooks wrap the row as { type, table, record, old_record }.
// We also accept a direct { policy_id } invocation for manual/testing dispatch.
interface DbWebhookBody {
  type?: 'INSERT' | 'UPDATE' | 'DELETE'
  table?: string
  record?: Record<string, unknown> | null
  old_record?: Record<string, unknown> | null
  policy_id?: string
  agency_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  // ── Auth: service-role bearer OR shared retention secret ───────────────────
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const retentionSecret = Deno.env.get('RETENTION_WEBHOOK_SECRET') || ''
  const bearer = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const providedSecret = req.headers.get('x-retention-secret') || ''
  const authedByBearer = !!serviceRoleKey && bearer === serviceRoleKey
  const authedBySecret = !!retentionSecret && providedSecret === retentionSecret
  if (!authedByBearer && !authedBySecret) return jsonResponse({ error: 'Forbidden' }, 403)

  const missingVar = checkRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (missingVar) return jsonResponse({ error: `Missing config: ${missingVar}` }, 503)

  let body: DbWebhookBody
  try { body = await req.json() } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400) }

  // Resolve the target case from either a DB-webhook payload or a direct call.
  const record = body.record || null
  const oldRecord = body.old_record || null
  const policyId = (record?.id as string) || body.policy_id
  if (!policyId) return jsonResponse({ error: 'policy_id (or record.id) is required' }, 400)

  // For DB-webhook updates, only act when the delta CROSSED the threshold, so
  // unrelated row updates don't re-fire the campaign.
  if (record) {
    const newDelta = Number(record.premium_change_pct ?? NaN)
    const oldDelta = oldRecord ? Number(oldRecord.premium_change_pct ?? NaN) : NaN
    const crossedUp = !(Number.isFinite(oldDelta) && oldDelta > PREMIUM_DELTA_THRESHOLD_PCT)
    if (!(Number.isFinite(newDelta) && newDelta > PREMIUM_DELTA_THRESHOLD_PCT && crossedUp)) {
      return jsonResponse({ skipped: true, reason: 'delta_not_crossed' })
    }
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
  const today = new Date().toISOString().split('T')[0]

  try {
    // ── 1. Load the case ─────────────────────────────────────────────────────
    const { data: rcase, error: fetchErr } = await supabase
      .from('renewal_cases')
      .select('id, agency_id, customer_name, phone, renewal_date, premium, current_premium, premium_change_pct, customer_group_id, status, human_only, claim_flag, last_retention_call_date')
      .eq('id', policyId)
      .single()

    if (fetchErr || !rcase) return jsonResponse({ error: 'Renewal case not found' }, 404)

    const delta = Number(rcase.premium_change_pct ?? NaN)
    if (!(Number.isFinite(delta) && delta > PREMIUM_DELTA_THRESHOLD_PCT)) {
      return jsonResponse({ skipped: true, reason: 'below_threshold', delta })
    }
    if (rcase.human_only) return jsonResponse({ skipped: true, reason: 'human_only' })
    if (rcase.claim_flag && rcase.claim_flag !== 'none') return jsonResponse({ skipped: true, reason: 'open_claim' })
    if (!rcase.phone) return jsonResponse({ skipped: true, reason: 'no_phone' })

    const e164 = formatPhoneUS(rcase.phone)
    if (!e164) return jsonResponse({ skipped: true, reason: 'invalid_phone' })

    // ── 2. Calling-window guard (no night-time backlog dialing) ──────────────
    if (!isWithinCallWindowEastern()) {
      return jsonResponse({ skipped: true, reason: 'outside_call_window' })
    }

    // ── 3. Consent gate — explicit autodial consent and not DNC (TCPA) ───────
    const { data: consent } = await supabase
      .from('customer_consent')
      .select('autodial_consent, dnc')
      .eq('agency_id', rcase.agency_id)
      .eq('customer_phone', rcase.phone)
      .maybeSingle()

    if (!consent?.autodial_consent || consent?.dnc) {
      return jsonResponse({ skipped: true, reason: 'no_consent_or_dnc' })
    }

    // ── 4. Idempotency lock — claim the case for today atomically ────────────
    // Only the first request to flip last_retention_call_date to today wins;
    // a retried webhook gets zero rows back and bails out.
    const { data: claimed, error: claimErr } = await supabase
      .from('renewal_cases')
      .update({ last_retention_call_date: today })
      .eq('id', rcase.id)
      .or(`last_retention_call_date.is.null,last_retention_call_date.lt.${today}`)
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      return jsonResponse({ skipped: true, reason: 'already_dispatched_today' })
    }

    // ── 5. Warm-transfer target — a licensed, currently-available producer ───
    let transferNumber: string | null = null
    try {
      const agentsRes = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/get-available-agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ agency_id: rcase.agency_id }),
      })
      if (agentsRes.ok) {
        const { agents = [] } = await agentsRes.json()
        transferNumber = agents[0]?.transfer_phone ?? null
      }
    } catch (e) {
      console.warn('[RATE_DEFLECTION] get-available-agents failed, falling back to callback-only:', e)
    }
    transferNumber = transferNumber || Deno.env.get('PRODUCER_TRANSFER_NUMBER') || null
    const transferAvailable = !!transferNumber

    // ── 6. Dispatch to Bland ─────────────────────────────────────────────────
    const blandKey = Deno.env.get('BLAND_AI_API_KEY') || Deno.env.get('BLAND_API_KEY')
    if (!blandKey) {
      // Release the lock so a later run can retry once config is fixed.
      await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rcase.id)
      console.error('[RATE_DEFLECTION] BLAND_AI_API_KEY not set')
      return jsonResponse({ error: 'Configuration error', detail: 'missing_bland_key' })
    }

    const firstName = (rcase.customer_name || '').split(' ')[0]
    const deltaDollars = (rcase.premium != null && rcase.current_premium != null)
      ? (Number(rcase.premium) - Number(rcase.current_premium)).toFixed(2)
      : ''

    const payload: Record<string, unknown> = {
      phone_number: e164,
      from: Deno.env.get('TWILIO_PHONE_NUMBER') || undefined,
      task: RATE_DEFLECTION_PROMPT,
      voice: 'maya',
      language: 'en-US',
      max_duration: 6,
      record: true,
      webhook: `${Deno.env.get('SUPABASE_URL')}/functions/v1/bland-renewal-webhook`,
      webhook_events: ['call_ended'],
      analysis_schema: ANALYSIS_SCHEMA,
      request_data: {
        first_name: firstName,
        transfer_available: String(transferAvailable),
        transfer_number: transferNumber || '',
        premium_delta_pct: String(delta),
      },
      metadata: {
        policy_id: rcase.id,
        agency_id: rcase.agency_id,
        customer_group_id: rcase.customer_group_id || null,
        customer_first_name: firstName,
        customer_name: rcase.customer_name,
        renewal_date: rcase.renewal_date,
        premium_change_pct: String(delta),
        premium_change_dollars: deltaDollars,
        campaign_type: 'rate_deflection',
      },
      ...(transferAvailable ? { transfer_phone_number: transferNumber } : {}),
    }

    let blandRes: Response
    try {
      blandRes = await fetch(BLAND_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${blandKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch (netErr) {
      // Network/timeout — release lock, log, alert gracefully, don't crash.
      await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rcase.id)
      console.error('[RATE_DEFLECTION] Bland network error:', netErr)
      return jsonResponse({ error: 'Bland network error', retryable: true })
    }

    if (!blandRes.ok) {
      const errText = (await blandRes.text()).slice(0, 500)
      // On a 5xx, release the lock so the case can be retried later.
      if (blandRes.status >= 500) {
        await supabase.from('renewal_cases').update({ last_retention_call_date: null }).eq('id', rcase.id)
      }
      console.error(`[RATE_DEFLECTION] Bland API ${blandRes.status}: ${errText}`)
      return jsonResponse({ error: 'Bland API error', status: blandRes.status, retryable: blandRes.status >= 500 })
    }

    const { call_id } = await blandRes.json()

    // ── 7. Attribution + state — best-effort, never block on these ───────────
    await supabase.from('ai_call_log').upsert({
      agency_id: rcase.agency_id,
      policy_id: rcase.id,
      bland_call_id: call_id,
      campaign_type: 'rate_deflection',
      call_type: 'rate_deflection',
      called_at: new Date().toISOString(),
    }, { onConflict: 'bland_call_id' })
      .then(({ error }) => { if (error) console.error('[RATE_DEFLECTION] ai_call_log insert failed:', error) })

    await supabase.from('renewal_cases')
      .update({ retention_status: 'at_risk', updated_at: new Date().toISOString() })
      .eq('id', rcase.id)
      .then(({ error }) => { if (error) console.error('[RATE_DEFLECTION] retention_status update failed:', error) })

    console.log(`[RATE_DEFLECTION] dispatched ${call_id} | case ${rcase.id} | +${delta}% | transfer=${transferAvailable}`)
    return jsonResponse({ success: true, call_id, policy_id: rcase.id, transfer_available: transferAvailable })

  } catch (err) {
    console.error('[RATE_DEFLECTION] Unhandled error:', err)
    return jsonResponse({ error: (err as Error).message || 'Internal error' }, 500)
  }
})
