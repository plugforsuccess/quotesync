// Supabase Edge Function: lead-notify-sms
// POST /functions/v1/lead-notify-sms
// Sends instant SMS to lead + initiates speed-to-call bridge to agent
// Called internally by create-lead after successful lead insertion

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Format phone to E.164 US format
function formatPhoneUS(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

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

// Initiate outbound call via Twilio REST API
async function initiateCall(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  twimlUrl: string,
  timeout: number = 20
): Promise<{ success: boolean; sid?: string; error?: string }> {
  const auth = btoa(`${accountSid}:${authToken}`)
  const params = new URLSearchParams()
  params.append('To', to)
  params.append('From', from)
  params.append('Url', twimlUrl)
  params.append('Timeout', timeout.toString())
  params.append('StatusCallback', twimlUrl.split('?')[0] + '?action=status')
  params.append('StatusCallbackEvent', 'completed')

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
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
    return { success: false, error: data.message || 'Twilio call failed' }
  }
  return { success: true, sid: data.sid }
}

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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)

  const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!
  const AGENT_PHONE_NUMBER = Deno.env.get('AGENT_PHONE_NUMBER')!

  try {
    const body = await req.json()
    const { lead_id, first_name, phone, zip, owns_home, vehicle_count } = body

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

    // ====== STEP 1: Send immediate SMS (T+0) ======
    const smsBody =
      `Hey ${name}! This is Cam from Insured By Cam. I'm pulling up your personalized auto + home quotes right now. I'll call you in about 30 seconds to walk you through your options. Talk soon!`

    const smsResult = await sendSMS(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER,
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
      console.error('[LEAD_NOTIFY_SMS] SMS send failed:', smsResult.error)
      await supabase.from('audit_log').insert({
        event_type: 'SMS_SENT',
        lead_id,
        metadata: { error: smsResult.error, message_type: 'initial', success: false },
      })
    }

    // ====== STEP 2: Speed-to-call (T+30s) ======
    // Wait 30 seconds before initiating the call bridge
    await new Promise((resolve) => setTimeout(resolve, 30000))

    // Build TwiML webhook URL for the whisper
    const voiceHandlerUrl = `${supabaseUrl}/functions/v1/twilio-voice-handler`
    const whisperParams = new URLSearchParams({
      action: 'whisper',
      lead_name: name,
      zip: zip || '',
      home: owns_home ? 'yes' : 'no',
      vehicles: (vehicle_count || 1).toString(),
      lead_phone: formattedPhone,
    })
    const twimlUrl = `${voiceHandlerUrl}?${whisperParams.toString()}`

    // Call the agent first
    const callResult = await initiateCall(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER,
      AGENT_PHONE_NUMBER,
      twimlUrl,
      20 // 20 second timeout
    )

    if (callResult.success) {
      // Update lead: call_initiated
      await supabase
        .from('leads')
        .update({ call_initiated: true, call_initiated_at: new Date().toISOString() })
        .eq('id', lead_id)

      // Log call message
      await supabase.from('lead_messages').insert({
        lead_id,
        direction: 'outbound',
        channel: 'call',
        body: `Speed-to-call initiated to agent, bridging to ${formattedPhone}`,
        twilio_sid: callResult.sid,
        status: 'initiated',
      })

      // Audit log
      await supabase.from('audit_log').insert({
        event_type: 'CALL_INITIATED',
        lead_id,
        metadata: { twilio_sid: callResult.sid, agent_phone: AGENT_PHONE_NUMBER },
      })
    } else {
      console.error('[LEAD_NOTIFY_SMS] Call initiation failed:', callResult.error)

      // Agent didn't answer — send follow-up SMS to lead
      const missedBody =
        `Hey ${name}, I just tried calling but missed you! I've got your quotes ready. What's a good time to chat tomorrow? Or reply here and I can text you your estimate.`

      const followUpResult = await sendSMS(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
        formattedPhone,
        missedBody
      )

      await supabase.from('lead_messages').insert({
        lead_id,
        direction: 'outbound',
        channel: 'sms',
        body: missedBody,
        twilio_sid: followUpResult.sid || null,
        status: followUpResult.success ? 'sent' : 'failed',
      })

      await supabase.from('audit_log').insert({
        event_type: 'CALL_MISSED',
        lead_id,
        metadata: { error: callResult.error, followup_sms_sent: followUpResult.success },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id,
      sms_sent: smsResult.success,
      call_initiated: callResult.success,
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
