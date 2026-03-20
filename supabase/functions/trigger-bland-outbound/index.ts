// Supabase Edge Function: trigger-bland-outbound
// POST /functions/v1/trigger-bland-outbound
// Called by create-lead (fire-and-forget) to initiate a Bland AI outbound call.
// Service role only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BLAND_API_URL = 'https://api.bland.ai/v1/calls'

function formatE164(phone: string | null): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length !== 10 && !(digits.length === 11 && digits.startsWith('1'))) return null
  const tenDigits = digits.length === 11 ? digits.substring(1) : digits
  if (tenDigits.startsWith('0') || tenDigits.startsWith('1')) return null
  return `+1${tenDigits}`
}

function isEasternBusinessHours(): boolean {
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

  // Mon-Fri 9am-6pm Eastern
  if (easternDay === 0 || easternDay === 6) return false
  return easternHour >= 9 && easternHour < 18
}

const OUTBOUND_PROMPT = `You are an AI assistant for Wiley-Wilson Insurance, an Allstate agency in Georgia. Your name is "Cam's assistant." You are calling because someone just submitted a quote request on our website.

Your goals in order:
1. Confirm you are speaking with the person who submitted the form (use their first name).
2. Verify or capture: full name, current address, date of birth, number of vehicles, whether they own or rent their home, and their current insurance carrier.
3. Determine if they are interested in auto, home, or both (bundle).
4. Qualify: they must be in Georgia, have at least 1 vehicle OR own/rent a home, and not be seeking commercial-only coverage.
5. If qualified AND {{is_anyone_available}} is true AND {{is_business_hours}} is true:
   Ask: "I have a licensed agent available right now — would you like me to connect you?"
   - If YES: transfer to {{transfer_number_1}}. If no answer in 20 seconds, try {{transfer_number_2}}. If still no answer, inform lead and book callback.
   - If they prefer a callback: capture preferred time.
6. If NOT available or after hours: book callback, capture preferred time, offer Canopy link.
7. If they have NOT already uploaded documents and are qualified: offer secure upload link.

Disqualify (politely) if:
- Outside Georgia
- No vehicles AND does not own or rent a home
- Commercial/business coverage only

If the person says "stop calling," "don't call me," or similar — acknowledge, apologize, confirm removal, and end the call immediately.
Never discuss specific rates, coverage details, or make binding commitments. You are not a licensed agent.
Keep under 5 minutes. Warm, natural, conversational.

Output these variables after every call:
verified_name, verified_address, verified_dob, verified_state, verified_zip, vehicle_count, owns_home, current_carrier, coverage_interest ("auto"|"home"|"bundle"|"unknown"), qualified (boolean), disqualify_reason, transfer_attempted (boolean), transferred (boolean), transferred_to_name, transfer_number_used (string — E.164 of the number Bland actually transferred to, or null), transfer_connected (boolean — true if the transferred call was answered), callback_requested (boolean), callback_time_preference, canopy_offered (boolean), canopy_accepted (boolean)`

async function logAudit(
  supabase: any,
  eventType: string,
  leadId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('audit_log').insert({
      event_type: eventType,
      lead_id: leadId,
      metadata,
    })
  } catch (err) {
    console.error(`[BLAND_OUTBOUND] Audit log failed for ${eventType}:`, err)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Auth: service role only
  const authHeader = req.headers.get('Authorization')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = authHeader?.replace('Bearer ', '') || ''
  if (token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  )

  try {
    // 1. Parse body
    const { lead_id } = await req.json()
    if (!lead_id) {
      return new Response(JSON.stringify({ error: 'lead_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Fetch lead record
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, phone, agency_id, bland_outbound_call_id, bland_outbound_status')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      console.error('[BLAND_OUTBOUND] Lead fetch error:', leadError)
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!lead.phone) {
      console.log(`[BLAND_OUTBOUND] No phone for lead ${lead_id}, skipping`)
      return new Response(JSON.stringify({ skipped: true, reason: 'no_phone' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Idempotency guard — do not double-call (allow retry for no-answer leads)
    const isRetry = lead.bland_outbound_status === 'no-answer' || lead.bland_outbound_status === 'no_answer'
    if (lead.bland_outbound_call_id && !isRetry) {
      console.log(`[BLAND_OUTBOUND] Already called lead ${lead_id}, skipping`)
      return new Response(JSON.stringify({ skipped: true, reason: 'already_called' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Get available agents (service-to-service)
    const agentsRes = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-available-agents`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ agency_id: lead.agency_id }),
      }
    )
    const { agents = [], is_anyone_available = false } = await agentsRes.json()

    // 5. Compute business hours
    const is_business_hours = isEasternBusinessHours()

    // 6. Build request_data
    const request_data = {
      is_business_hours,
      is_anyone_available: is_business_hours && is_anyone_available,
      transfer_number_1: agents[0]?.transfer_phone ?? null,
      transfer_number_2: agents[1]?.transfer_phone ?? null,
      transfer_number_3: agents[2]?.transfer_phone ?? null,
      transfer_agent_1_name: agents[0]?.name ?? null,
      transfer_agent_2_name: agents[1]?.name ?? null,
      transfer_agent_3_name: agents[2]?.name ?? null,
      office_number: Deno.env.get('RINGCENTRAL_OFFICE_NUMBER') ?? null,
    }

    // 7. Call Bland API
    const blandApiKey = Deno.env.get('BLAND_API_KEY')
    if (!blandApiKey) {
      console.error('[BLAND_OUTBOUND] BLAND_API_KEY not set')
      await logAudit(supabase, 'BLAND_OUTBOUND_FAILED', lead.id, { reason: 'missing_api_key' })
      return new Response(JSON.stringify({ error: 'Configuration error' }), {
        status: 200, // 200 to caller — failure logged
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const e164Phone = formatE164(lead.phone)
    if (!e164Phone) {
      console.log(`[BLAND_OUTBOUND] Invalid phone for lead ${lead_id}: ${lead.phone}`)
      return new Response(JSON.stringify({ skipped: true, reason: 'invalid_phone' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const bland_res = await fetch(BLAND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${blandApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone_number: e164Phone,
        task: OUTBOUND_PROMPT,
        request_data,
        webhook: `${Deno.env.get('SUPABASE_URL')}/functions/v1/bland-webhook`,
        webhook_events: ['call_ended'],
        max_duration: 300,
        transfer_phone_number: request_data.transfer_number_1 || undefined,
        transfer_list: {
          ...(request_data.transfer_number_1 ? { [request_data.transfer_number_1]: request_data.transfer_agent_1_name || 'Agent 1' } : {}),
          ...(request_data.transfer_number_2 ? { [request_data.transfer_number_2]: request_data.transfer_agent_2_name || 'Agent 2' } : {}),
          ...(request_data.transfer_number_3 ? { [request_data.transfer_number_3]: request_data.transfer_agent_3_name || 'Agent 3' } : {}),
        },
      }),
    })

    if (!bland_res.ok) {
      const errText = await bland_res.text()
      console.error(`[BLAND_OUTBOUND] Bland API error: ${bland_res.status}`, errText)
      await logAudit(supabase, 'BLAND_OUTBOUND_FAILED', lead.id, {
        status: bland_res.status,
        error: errText.substring(0, 500),
      })
      return new Response(JSON.stringify({ error: 'Bland API error' }), {
        status: 200, // 200 to caller — failure logged
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { call_id } = await bland_res.json()

    // 8. Update lead record
    await supabase
      .from('leads')
      .update({
        bland_outbound_call_id: call_id,
        bland_outbound_status: 'pending',
      })
      .eq('id', lead.id)

    await logAudit(supabase, 'BLAND_OUTBOUND_INITIATED', lead.id, {
      call_id,
      is_business_hours,
      is_anyone_available: request_data.is_anyone_available,
      agent_count: agents.length,
    })

    return new Response(JSON.stringify({ call_id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[BLAND_OUTBOUND] Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 200, // 200 to caller — must not block create-lead
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
