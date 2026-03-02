// Supabase Edge Function: twilio-sms-inbound
// POST /functions/v1/twilio-sms-inbound
// Handles inbound SMS replies from leads via Twilio webhook
// Processes keywords (STOP, QUOTE, YES) and forwards other messages to agent

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Send SMS via Twilio REST API
async function sendSMS(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const auth = btoa(`${accountSid}:${authToken}`)
  const params = new URLSearchParams()
  params.append('To', to)
  params.append('From', from)
  params.append('Body', body)

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    }
  )

  const data = await response.json()
  if (!response.ok) {
    return { success: false, error: data.message || 'Twilio SMS failed' }
  }
  return { success: true, sid: data.sid }
}

// Return TwiML response (Twilio expects XML for webhook responses)
function twimlResponse(message?: string): Response {
  const twiml = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response/>`

  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

Deno.serve(async (req) => {
  // Twilio sends POST with application/x-www-form-urlencoded
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
  const AGENT_PHONE_NUMBER = Deno.env.get('AGENT_PHONE_NUMBER')!

  try {
    // Parse Twilio webhook body (form-encoded)
    const formData = await req.formData()
    const fromNumber = formData.get('From')?.toString() || ''
    const body = formData.get('Body')?.toString()?.trim() || ''
    const messageSid = formData.get('MessageSid')?.toString() || ''

    if (!fromNumber || !body) {
      return twimlResponse()
    }

    // Normalize phone number for lookup (strip +1 prefix)
    const normalizedPhone = fromNumber.replace(/^\+1/, '').replace(/\D/g, '')

    // Look up lead by phone number (most recent match)
    const { data: lead } = await supabase
      .from('leads')
      .select('id, first_name, agency_id, sms_opted_out')
      .or(`phone.eq.${normalizedPhone},phone.eq.+1${normalizedPhone},phone.eq.${fromNumber}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!lead) {
      console.log(`[SMS_INBOUND] No lead found for phone: ${fromNumber}`)
      // Forward unknown number to agent anyway
      await sendSMS(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
        AGENT_PHONE_NUMBER,
        `Incoming SMS from unknown number ${fromNumber}: ${body}`
      )
      return twimlResponse()
    }

    // Log inbound message
    await supabase.from('lead_messages').insert({
      lead_id: lead.id,
      direction: 'inbound',
      channel: 'sms',
      body,
      twilio_sid: messageSid,
      status: 'received',
    })

    // Audit log
    await supabase.from('audit_log').insert({
      event_type: 'SMS_INBOUND',
      lead_id: lead.id,
      agency_id: lead.agency_id,
      metadata: { from: fromNumber, body_preview: body.substring(0, 100), keyword: body.toUpperCase() },
    })

    const keyword = body.toUpperCase()

    // Handle STOP — opt out
    if (keyword === 'STOP') {
      await supabase
        .from('leads')
        .update({ sms_opted_out: true })
        .eq('id', lead.id)

      return twimlResponse(
        'You have been opted out and will not receive further messages from Insured By Cam. Reply START to re-subscribe.'
      )
    }

    // Handle START — re-subscribe
    if (keyword === 'START') {
      await supabase
        .from('leads')
        .update({ sms_opted_out: false })
        .eq('id', lead.id)

      return twimlResponse(
        'Welcome back! You have been re-subscribed to messages from Insured By Cam.'
      )
    }

    // Handle QUOTE or YES — mark as interested + notify agent
    if (keyword === 'QUOTE' || keyword === 'YES') {
      await supabase
        .from('leads')
        .update({ status: 'interested', contacted_at: new Date().toISOString() })
        .eq('id', lead.id)

      // Notify agent
      const leadName = lead.first_name || 'A lead'
      await sendSMS(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
        AGENT_PHONE_NUMBER,
        `${leadName} replied "${body}" and is interested! Phone: ${fromNumber}. Call them ASAP.`
      )

      return twimlResponse(
        `Great choice, ${lead.first_name || 'there'}! Cam will reach out shortly with your personalized quote. Talk soon!`
      )
    }

    // All other messages — forward to agent
    const leadName = lead.first_name || 'Lead'
    await sendSMS(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER,
      AGENT_PHONE_NUMBER,
      `SMS from ${leadName} (${fromNumber}): ${body}`
    )

    return twimlResponse()

  } catch (error) {
    console.error('[SMS_INBOUND] Error:', error)
    return twimlResponse()
  }
})
