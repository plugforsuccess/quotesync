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

const OUTBOUND_PROMPT = `You are calling on behalf of Wiley-Wilson Insurance Agency in Conyers, Georgia. A potential customer just submitted a quote request through our website. Your job is to confirm their information, let them know a licensed agent is reviewing their details, and offer to connect them with an available agent right now for a live consultation.

STRICT RULES:
1. Identify yourself as an automated courtesy call in the first sentence.
2. Keep the call brief and professional — under 2 minutes.
3. If the customer wants to speak with an agent and one is available, offer to transfer them.
4. If no agent is available, let them know someone will call back shortly and offer to send them a link to complete their quote online.
5. If the customer says "stop calling," "don't call me," or similar — acknowledge, apologize, confirm removal, and end the call immediately.
6. Never discuss specific rates, coverage details, or make binding commitments. You are not a licensed agent.
7. Be warm, helpful, and respectful of their time.`

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
      .select('id, phone, agency_id, bland_outbound_call_id')
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

    // 3. Idempotency guard — do not double-call
    if (lead.bland_outbound_call_id) {
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
