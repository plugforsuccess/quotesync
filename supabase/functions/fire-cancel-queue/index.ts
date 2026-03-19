// Supabase Edge Function: fire-cancel-queue
// POST /functions/v1/fire-cancel-queue
// Triggered by the "Run AI Cancels" button in QuoteSync.
// Validates records against pre-call gates, normalizes phones,
// submits eligible calls to Bland.ai one at a time with 4-second delays.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars } from '../_shared/twilio.ts'

const BATCH_LIMIT = 30
// 4-second delay keeps a full 30-call batch under the 150-second Supabase edge
// function timeout while still spacing submissions enough to avoid Bland.ai 429s.
const CALL_DELAY_MS = 4_000
const BLAND_API_URL = 'https://api.bland.ai/v1/calls'

function formatE164(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith('1'))) return null
  const tenDigits = digits.length === 11 ? digits.substring(1) : digits
  // Invalid US: starts with 0 or 1
  if (tenDigits.startsWith('0') || tenDigits.startsWith('1')) return null
  return `+1${tenDigits}`
}

function isEasternBusinessHours(): boolean {
  const now = new Date()
  // Determine Eastern offset accounting for DST
  // DST: 2nd Sunday of March to 1st Sunday of November
  const year = now.getUTCFullYear()
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1))
  marchSecondSunday.setUTCDate(marchSecondSunday.getUTCDate() + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7)
  const novFirstSunday = new Date(Date.UTC(year, 10, 1))
  novFirstSunday.setUTCDate(novFirstSunday.getUTCDate() + ((7 - novFirstSunday.getUTCDay()) % 7))

  // DST transition times (2:00 AM ET)
  const dstStart = new Date(marchSecondSunday.getTime() + 7 * 60 * 60 * 1000) // 2AM EST = 7AM UTC
  const dstEnd = new Date(novFirstSunday.getTime() + 6 * 60 * 60 * 1000) // 2AM EDT = 6AM UTC

  const isDST = now >= dstStart && now < dstEnd
  const offsetHours = isDST ? 4 : 5
  const easternHour = (now.getUTCHours() - offsetHours + 24) % 24
  const easternMinutes = now.getUTCMinutes()
  const easternTime = easternHour + easternMinutes / 60
  return easternTime >= 8 && easternTime < 20.5 // 8:00 AM to 8:30 PM
}

function isSuppressedDay(): { suppressed: boolean; reason?: string } {
  const now = new Date()
  const day = now.getUTCDay() // 0 = Sunday, 6 = Saturday
  if (day === 0 || day === 6) return { suppressed: true, reason: 'weekend' }

  // Federal holidays (approximate — fixed-date holidays)
  const year = now.getUTCFullYear()
  const holidays: Array<{ date: string; name: string }> = [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: `${year}-07-04`, name: 'Independence Day' },
    { date: `${year}-12-25`, name: 'Christmas' },
  ]

  // Floating holidays
  // Memorial Day: last Monday of May
  const mayLast = new Date(Date.UTC(year, 4, 31))
  while (mayLast.getUTCDay() !== 1) mayLast.setUTCDate(mayLast.getUTCDate() - 1)
  holidays.push({ date: mayLast.toISOString().split('T')[0], name: 'Memorial Day' })

  // Labor Day: first Monday of September
  const sepFirst = new Date(Date.UTC(year, 8, 1))
  while (sepFirst.getUTCDay() !== 1) sepFirst.setUTCDate(sepFirst.getUTCDate() + 1)
  holidays.push({ date: sepFirst.toISOString().split('T')[0], name: 'Labor Day' })

  // Thanksgiving: 4th Thursday of November
  const novFirst = new Date(Date.UTC(year, 10, 1))
  let thursdayCount = 0
  const thanksgiving = new Date(novFirst)
  while (thursdayCount < 4) {
    if (thanksgiving.getUTCDay() === 4) thursdayCount++
    if (thursdayCount < 4) thanksgiving.setUTCDate(thanksgiving.getUTCDate() + 1)
  }
  holidays.push({ date: thanksgiving.toISOString().split('T')[0], name: 'Thanksgiving' })

  const todayStr = now.toISOString().split('T')[0]
  const holiday = holidays.find((h) => h.date === todayStr)
  if (holiday) return { suppressed: true, reason: `holiday:${holiday.name}` }

  return { suppressed: false }
}

// System prompt for Bland.ai
const CANCEL_SYSTEM_PROMPT = `You are a courtesy outreach assistant calling on behalf of Wiley-Wilson Insurance Agency in Conyers, Georgia. Your role is to inform policyholders that their policy has a pending cancellation notice, understand the situation, and help them resolve it — either by collecting a payment promise, routing them to a team member, or confirming their intent.

STRICT RULES — follow these without exception:
1. You are only permitted to discuss information explicitly provided in your metadata. Do not speculate about coverage details, payment history, or any information not provided.
2. Identify yourself as an automated call in the first sentence of every call.
3. If asked ANY question you cannot answer from the metadata — do NOT attempt to answer. Say: "That's a great question for your agent. Let me flag this for Cameron to call you personally." Then escalate and end the call.
4. If the customer says anything resembling "stop calling," "don't call me again," "remove me from your list" — acknowledge it, apologize, confirm removal, set variables.opt_out_requested = "true", and end the call immediately. Legal requirement.
5. If the customer becomes upset or aggressive — acknowledge, apologize, offer Cameron callback, escalate, end call.
6. Never disclose account details to a third party. If someone other than the named insured answers, do not share any account information.
7. Your goal: collect a payment promise or route to the right team member. Always offer a personal callback before ending any call where the customer has not committed to payment.
8. If the customer says they intend to cancel — acknowledge respectfully, confirm their intent, and set call_outcome to intentional_cancel. Do not pressure them.
9. If the customer mentions a claim — immediately escalate to Cameron. Do not discuss the claim.
10. At the end of every call, populate the analysis_schema fields accurately.`

const CANCEL_ANALYSIS_SCHEMA = {
  call_outcome: {
    type: 'string',
    description: 'Primary outcome — choose single best match',
    enum: [
      'payment_promised',
      'payment_made',
      'payment_plan_requested',
      'claims_dispute',
      'intentional_cancel',
      'rate_shock_escalated',
      'callback_scheduled',
      'wrong_number',
      'third_party_answer',
      'voicemail',
      'no_answer',
      'opt_out_requested',
    ],
  },
  payment_promise_date: {
    type: 'string',
    description: 'Date customer promised to pay (YYYY-MM-DD), if applicable',
  },
  callback_confirmed: {
    type: 'boolean',
    description: 'True only if customer explicitly agreed to a callback from the agency',
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Auth: validate JWT and enforce principal role
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'BLAND_AI_API_KEY', 'TWILIO_PHONE_NUMBER',
  ])
  if (missingVar) return new Response(JSON.stringify({ error: `Missing config: ${missingVar}` }), {
    status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

  // Verify JWT by creating a user-scoped client and checking the session
  const userSupabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userSupabase.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Look up the caller's employee record + agency membership to verify principal role
  const serviceSupabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: membership, error: membershipError } = await serviceSupabase
    .from('agency_memberships')
    .select('agency_id, agency_role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('agency_role', 'principal')
    .limit(1)
    .maybeSingle()

  if (membershipError || !membership) {
    return new Response(JSON.stringify({ error: 'Forbidden — principal role required' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { override_suppression?: boolean } = {}
  try { body = await req.json() } catch { /* use defaults */ }

  // Use the agency_id from the authenticated membership — never trust client-supplied value
  const agency_id = membership.agency_id
  const { override_suppression = false } = body

  // Day suppression check
  const suppression = isSuppressedDay()
  if (suppression.suppressed && !override_suppression) {
    return new Response(JSON.stringify({
      suppressed: true,
      reason: suppression.reason,
      message: `AI calls are suppressed today (${suppression.reason}). Pass override_suppression: true to proceed.`,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Calling hours check
  if (!isEasternBusinessHours()) {
    return new Response(JSON.stringify({
      suppressed: true,
      reason: 'outside_calling_hours',
      message: 'Outside calling hours (8:00 AM – 8:30 PM Eastern).',
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabase = serviceSupabase
  const BLAND_API_KEY = Deno.env.get('BLAND_AI_API_KEY')!
  const TWILIO_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()

  // Log override if applicable
  if (override_suppression && suppression.suppressed) {
    console.warn(`[FIRE_CANCEL_QUEUE] Suppression overridden: ${suppression.reason} | agency: ${agency_id}`)
  }

  // Fetch automation-cleared candidates
  const { data: candidates, error: fetchError } = await supabase
    .from('pending_cases')
    .select(`
      id, policy_no, product, customer_name, phone,
      cancel_effective_date, amount_due, premium_at_risk,
      attempt_count, last_contact_date, last_contact_outcome,
      status, stage, human_only,
      customer_consent!inner ( autodial_consent, dnc )
    `)
    .eq('agency_id', agency_id)
    .in('status', ['pending', 'contacted'])
    .eq('human_only', false)
    .lt('attempt_count', 3)
    .neq('last_contact_outcome', 'intentional_cancel')
    .neq('last_contact_outcome', 'claims_dispute')
    .gte('cancel_effective_date', today)
    .order('cancel_effective_date', { ascending: true })
    .limit(BATCH_LIMIT * 2) // fetch extra to account for gate failures

  if (fetchError) {
    console.error('[FIRE_CANCEL_QUEUE] Fetch error:', fetchError)
    return new Response(JSON.stringify({ error: 'Failed to fetch candidates', details: fetchError.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const queued: string[] = []
  const blocked: Array<{ policy_id: string; reason: string }> = []
  const skipped: Array<{ policy_id: string; reason: string }> = []
  let rateLimited = false

  for (const record of (candidates || [])) {
    if (queued.length >= BATCH_LIMIT) break

    // Gate: consent
    if (!record.customer_consent?.autodial_consent || record.customer_consent?.dnc) {
      blocked.push({ policy_id: record.id, reason: 'consent_or_dnc' }); continue
    }

    // Gate: contact window (0–21 days until cancel effective date)
    const cancelDate = new Date(record.cancel_effective_date)
    const daysUntil = Math.ceil((cancelDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil < 0 || daysUntil > 21) {
      blocked.push({ policy_id: record.id, reason: 'outside_contact_window' }); continue
    }

    // Gate: attempt spacing (48h)
    if (record.last_contact_date) {
      const lastContact = new Date(record.last_contact_date)
      const hoursSince = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60)
      if (hoursSince < 48) { blocked.push({ policy_id: record.id, reason: 'attempt_spacing' }); continue }
    }

    // Gate: not already contacted today
    if (record.last_contact_date?.startsWith(today)) {
      blocked.push({ policy_id: record.id, reason: 'already_attempted_today' }); continue
    }

    // Gate: open followup
    if (record.human_followup_required) {
      blocked.push({ policy_id: record.id, reason: 'open_followup' }); continue
    }

    // Phone normalization
    const e164Phone = formatE164(record.phone)
    if (!e164Phone) {
      skipped.push({ policy_id: record.id, reason: 'invalid_phone' }); continue
    }

    // Build payload
    const payload = {
      phone_number: e164Phone,
      from: TWILIO_NUMBER,
      task: CANCEL_SYSTEM_PROMPT,
      voice: 'maya',
      language: 'en-US',
      max_duration: 4,
      record: false,
      webhook: `${SUPABASE_URL}/functions/v1/bland-cancel-webhook`,
      webhook_events: ['call_ended'],
      analysis_schema: CANCEL_ANALYSIS_SCHEMA,
      metadata: {
        policy_id: record.id,
        agency_id,
        call_type: 'cancel',
        customer_first_name: record.customer_name.split(' ')[0],
        customer_name: record.customer_name,
        policy_no: record.policy_no,
        product: record.product || '',
        cancel_effective_date: record.cancel_effective_date,
        amount_due: String(record.amount_due || ''),
        premium_at_risk: String(record.premium_at_risk || ''),
      },
    }

    // Submit to Bland.ai
    try {
      const response = await fetch(BLAND_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${BLAND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.status === 429 || response.status === 503) {
        console.warn(`[FIRE_CANCEL_QUEUE] Rate limited at record ${queued.length} of ${candidates?.length || 0}. Stopping run.`)
        rateLimited = true
        break
      }

      if (!response.ok) {
        const err = await response.text()
        console.error(`[FIRE_CANCEL_QUEUE] Bland.ai error for ${record.id}:`, err)
        skipped.push({ policy_id: record.id, reason: `bland_error_${response.status}` })
        continue
      }

      // ai_call_log is written by the webhook on call_ended — not here.
      // Writing here would create duplicate rows (one queued, one from webhook)
      // and inflate every metric. The webhook is the single source of truth.
      queued.push(record.id)

      // 4-second delay between submissions (last call doesn't need delay)
      if (queued.length < BATCH_LIMIT && queued.length < (candidates?.length || 0)) {
        await new Promise(resolve => setTimeout(resolve, CALL_DELAY_MS))
      }
    } catch (err) {
      console.error(`[FIRE_CANCEL_QUEUE] Network error for ${record.id}:`, err)
      skipped.push({ policy_id: record.id, reason: 'network_error' })
      continue
    }
  }

  const totalCandidates = candidates?.length || 0
  const held = Math.max(0, totalCandidates - queued.length - blocked.length - skipped.length)

  console.log(`[FIRE_CANCEL_QUEUE] Run complete: ${queued.length} queued, ${blocked.length} blocked, ${skipped.length} skipped, ${held} held, rate_limited: ${rateLimited}`)

  return new Response(JSON.stringify({
    success: true,
    queued: queued.length,
    blocked: blocked.length,
    skipped: skipped.length,
    held,
    rate_limited: rateLimited,
    details: { blocked, skipped },
  }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
