// Supabase Edge Function: lead-notify-sms
// POST /functions/v1/lead-notify-sms
// Sends warm-up SMS to lead (speed-to-call is handled by trigger-bland-outbound)
// Called internally by create-lead after successful lead insertion

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendSMS, formatPhoneUS, checkRequiredEnvVars } from '../_shared/twilio.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // F-03 fix: Authenticate — only allow internal calls with service role key
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('Authorization')
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Validate required env vars
  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  ])
  if (missingVar) {
    console.error(`[LEAD_NOTIFY_SMS] Missing required env var: ${missingVar}`)
    return new Response(JSON.stringify({ error: `Missing config: ${missingVar}` }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const ENV_TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!

  try {
    const body = await req.json()
    const { lead_id, first_name, phone, zip, owns_home, vehicle_count, agency_id } = body

    if (!lead_id || !phone) {
      return new Response(JSON.stringify({ error: 'lead_id and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate and format phone number
    const formattedPhone = formatPhoneUS(phone)
    if (!formattedPhone) {
      return new Response(JSON.stringify({ error: 'Invalid US phone number' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const name = first_name || 'there'

    // Fetch agency branding and Twilio config
    let agentName = 'your agent'
    let brandName = 'your insurance agency'
    let twilioFromNumber = ENV_TWILIO_PHONE_NUMBER

    if (agency_id) {
      const { data: agency } = await supabase
        .from('agencies')
        .select('brand_name, agent_first_name, twilio_from_number')
        .eq('id', agency_id)
        .single()

      if (agency) {
        if (agency.agent_first_name) agentName = agency.agent_first_name
        if (agency.brand_name) brandName = agency.brand_name
        if (agency.twilio_from_number) twilioFromNumber = agency.twilio_from_number
      }
    }

    // ====== STEP 1: Send immediate SMS (T+0) ======
    const smsBody =
      `Hey ${name}! This is ${agentName} from ${brandName}. I'm pulling up your personalized quotes right now. I'll call you in about 30 seconds to walk you through your options. Talk soon!`

    const smsResult = await sendSMS(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      twilioFromNumber,
      formattedPhone,
      smsBody
    )

    if (smsResult.success) {
      // Update lead: sms_sent
      await supabase
        .from('leads')
        .update({ sms_sent: true, sms_sent_at: new Date().toISOString() })
        .eq('id', lead_id)

      // Log message
      await supabase.from('lead_messages').insert({
        lead_id,
        direction: 'outbound',
        channel: 'sms',
        body: smsBody,
        twilio_sid: smsResult.sid,
        status: 'sent',
      })

      // Audit log
      await supabase.from('audit_log').insert({
        event_type: 'SMS_SENT',
        lead_id,
        metadata: { twilio_sid: smsResult.sid, message_type: 'initial' },
      })
    } else {
      console.error('[LEAD_NOTIFY_SMS] SMS send failed:', smsResult.error, 'code:', smsResult.code)
      await supabase.from('audit_log').insert({
        event_type: 'SMS_SENT',
        lead_id,
        metadata: { error: smsResult.error, code: smsResult.code, message_type: 'initial', success: false },
      })
    }

    // Speed-to-call is now handled by trigger-bland-outbound (Bland AI),
    // fired separately from create-lead. This function is SMS-only.

    return new Response(JSON.stringify({
      success: true,
      lead_id,
      sms_sent: smsResult.success,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[LEAD_NOTIFY_SMS] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
