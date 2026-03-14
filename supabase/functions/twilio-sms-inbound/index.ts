// Supabase Edge Function: twilio-sms-inbound
// POST /functions/v1/twilio-sms-inbound
// Handles inbound SMS replies from leads via Twilio webhook
// Processes keywords (STOP, START, HELP, QUOTE, YES) and forwards other messages to agent

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS, normalizePhoneForStorage, validateTwilioSignature, checkRequiredEnvVars } from '../_shared/twilio.ts'

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

  // Validate required env vars
  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'AGENT_PHONE_NUMBER',
  ])
  if (missingVar) {
    console.error(`[SMS_INBOUND] Missing required env var: ${missingVar}`)
    return new Response(JSON.stringify({ error: `Missing config: ${missingVar}` }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!

  // Validate Twilio signature to prevent spoofed webhook calls
  const publicUrl = `${supabaseUrl}/functions/v1/twilio-sms-inbound`
  const isValid = await validateTwilioSignature(req, TWILIO_AUTH_TOKEN, publicUrl)
  if (!isValid) {
    console.error('[SMS_INBOUND] Invalid Twilio signature — rejecting request')
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const ENV_TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
  const ENV_AGENT_PHONE_NUMBER = Deno.env.get('AGENT_PHONE_NUMBER')!

  try {
    // Parse Twilio webhook body (form-encoded)
    const formData = await req.formData()
    const fromNumber = formData.get('From')?.toString() || ''
    const body = formData.get('Body')?.toString()?.trim() || ''
    const messageSid = formData.get('MessageSid')?.toString() || ''

    if (!fromNumber || !body) {
      return twimlResponse()
    }

    // Normalize phone number to 10-digit canonical format for consistent lookup
    const normalizedPhone = normalizePhoneForStorage(fromNumber)

    // Look up lead by phone number (consistent 10-digit format)
    const { data: lead } = normalizedPhone
      ? await supabase
          .from('leads')
          .select('id, first_name, agency_id, sms_opted_out')
          .eq('phone', normalizedPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
      : { data: null }

    if (!lead) {
      console.log(`[SMS_INBOUND] No lead found for phone: ${fromNumber}`)
      // Forward unknown number to agent anyway
      await sendSMS(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        ENV_TWILIO_PHONE_NUMBER,
        ENV_AGENT_PHONE_NUMBER,
        `Incoming SMS from unknown number ${fromNumber}: ${body}`
      )
      return twimlResponse()
    }

    // Fetch agency branding and phone config for this lead's agency
    let agencyBrand = 'Insured By Cam'
    let agencyEmail = 'cameron@insuredbycam.com'
    let agencyDescription = 'Insurance quotes'
    let twilioFromNumber = ENV_TWILIO_PHONE_NUMBER
    let agentPhoneNumber = ENV_AGENT_PHONE_NUMBER

    if (lead.agency_id) {
      const { data: agency } = await supabase
        .from('agencies')
        .select('brand_name, email, twilio_from_number, agent_cell_number')
        .eq('id', lead.agency_id)
        .single()

      if (agency) {
        if (agency.brand_name) agencyBrand = agency.brand_name
        if (agency.email) agencyEmail = agency.email
        if (agency.twilio_from_number) twilioFromNumber = agency.twilio_from_number
        if (agency.agent_cell_number) agentPhoneNumber = agency.agent_cell_number
      }
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

    // Audit log — no PII, only lead_id reference and keyword classification
    const keyword = body.toUpperCase()
    await supabase.from('audit_log').insert({
      event_type: 'SMS_INBOUND',
      lead_id: lead.id,
      agency_id: lead.agency_id,
      metadata: { keyword, is_known_lead: true },
    })

    // Handle STOP — opt out
    if (keyword === 'STOP') {
      await supabase
        .from('leads')
        .update({ sms_opted_out: true })
        .eq('id', lead.id)

      return twimlResponse(
        `You have been opted out and will not receive further messages from ${agencyBrand}. Reply START to re-subscribe.`
      )
    }

    // Handle START — re-subscribe
    if (keyword === 'START') {
      await supabase
        .from('leads')
        .update({ sms_opted_out: false })
        .eq('id', lead.id)

      return twimlResponse(
        `Welcome back! You have been re-subscribed to messages from ${agencyBrand}.`
      )
    }

    // Handle HELP — CTIA compliance requirement
    if (keyword === 'HELP') {
      return twimlResponse(
        `${agencyBrand}: ${agencyDescription}. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out. Contact: ${agencyEmail}`
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
        twilioFromNumber,
        agentPhoneNumber,
        `${leadName} replied "${body}" and is interested! Phone: ${fromNumber}. Call them ASAP.`
      )

      return twimlResponse(
        `Great choice, ${lead.first_name || 'there'}! ${agencyBrand} will reach out shortly with your personalized quote. Talk soon!`
      )
    }

    // All other messages — forward to agent
    const leadName = lead.first_name || 'Lead'
    await sendSMS(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      twilioFromNumber,
      agentPhoneNumber,
      `SMS from ${leadName} (${fromNumber}): ${body}`
    )

    return twimlResponse()

  } catch (error) {
    console.error('[SMS_INBOUND] Error:', error)
    return twimlResponse()
  }
})
