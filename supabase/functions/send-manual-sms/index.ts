// Supabase Edge Function: send-manual-sms
// POST /functions/v1/send-manual-sms
// Called by authenticated producers to send a manual SMS reply to a lead.
// Auth: Verifies user is an authenticated agency member for the lead.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Inline phone formatter (no _shared import pattern for user-facing functions)
function formatPhoneUS(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

// Inline SMS sender
async function sendSMS(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; sid?: string; error?: string; code?: number }> {
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
    return { success: false, error: data.message || 'Twilio SMS failed', code: data.code }
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

  // Create client with user's auth token for RLS
  const authHeader = req.headers.get('Authorization') || ''
  const userToken = authHeader.replace('Bearer ', '')
  const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || supabaseKey, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })

  // Service role client for writes
  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // Verify authenticated user
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const { lead_id, body: messageBody } = body

    if (!lead_id || !messageBody?.trim()) {
      return new Response(JSON.stringify({ error: 'lead_id and body are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, phone, agency_id, first_name')
      .eq('id', lead_id)
      .single()

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user has agency membership for this lead
    const { data: membership, error: membershipError } = await supabase
      .from('agency_memberships')
      .select('id')
      .eq('user_id', user.id)
      .eq('agency_id', lead.agency_id)
      .eq('status', 'active')
      .limit(1)
      .single()

    if (membershipError || !membership) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Format phone
    const formattedPhone = formatPhoneUS(lead.phone)
    if (!formattedPhone) {
      return new Response(JSON.stringify({ error: 'Invalid phone number on lead' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send SMS
    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID')!
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!
    const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!

    const smsResult = await sendSMS(
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      TWILIO_PHONE_NUMBER,
      formattedPhone,
      messageBody.trim()
    )

    if (!smsResult.success) {
      return new Response(JSON.stringify({ error: smsResult.error || 'SMS send failed' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Log message
    await supabase.from('lead_messages').insert({
      lead_id,
      direction: 'outbound',
      channel: 'sms',
      body: messageBody.trim(),
      twilio_sid: smsResult.sid,
      status: 'sent',
    })

    // Audit log
    await supabase.from('audit_log').insert({
      event_type: 'SMS_MANUAL_SENT',
      lead_id,
      agency_id: lead.agency_id,
      metadata: {
        twilio_sid: smsResult.sid,
        actor_user_id: user.id,
      },
    })

    return new Response(JSON.stringify({ success: true, sid: smsResult.sid }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SEND_MANUAL_SMS] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
