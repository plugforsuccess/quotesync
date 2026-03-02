// Supabase Edge Function: twilio-voice-handler
// Returns TwiML XML for the speed-to-call bridge flow
// Called by Twilio as a webhook when processing voice calls
//
// Endpoints (via query params):
//   ?action=whisper  — Plays lead info whisper to agent, gathers digit "1" to connect
//   ?action=bridge   — Dials the lead's phone to complete the call bridge
//   ?action=status   — Handles call status callbacks (completed, no-answer, etc.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateTwilioSignature, normalizePhoneForStorage, checkRequiredEnvVars, verifyInternalToken } from '../_shared/twilio.ts'

// TwiML response helper
function twimlResponse(twiml: string): Response {
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

Deno.serve(async (req) => {
  // Validate required env vars
  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  ])
  if (missingVar) {
    console.error(`[TWILIO_VOICE_HANDLER] Missing required env var: ${missingVar}`)
    return new Response(JSON.stringify({ error: `Missing config: ${missingVar}` }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')!

  // Validate Twilio signature on POST requests (all Twilio webhooks are POST)
  if (req.method === 'POST') {
    // Build the public-facing URL for signature validation
    // Supabase Edge Functions sit behind a proxy, so use the canonical URL
    const publicUrl = `${supabaseUrl}/functions/v1/twilio-voice-handler${url.search}`

    const isValid = await validateTwilioSignature(req, TWILIO_AUTH_TOKEN, publicUrl)
    if (!isValid) {
      console.error('[TWILIO_VOICE_HANDLER] Invalid Twilio signature — rejecting request')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  if (action === 'whisper') {
    // Validate internal token to prevent unauthenticated info disclosure on GET
    const token = url.searchParams.get('token') || ''
    const leadId = url.searchParams.get('lead_id') || ''
    const isValidToken = await verifyInternalToken(token, leadId, TWILIO_AUTH_TOKEN)
    if (!isValidToken) {
      console.error('[TWILIO_VOICE_HANDLER] Invalid internal token on whisper request')
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Agent answered — play whisper with lead info and gather digit input
    const leadName = url.searchParams.get('lead_name') || 'Unknown'
    const zip = url.searchParams.get('zip') || 'unknown'
    const home = url.searchParams.get('home') === 'yes' ? 'homeowner' : 'renter'
    const vehicles = url.searchParams.get('vehicles') || '1'
    const leadPhone = url.searchParams.get('lead_phone') || ''

    // Build URL for the bridge action
    const bridgeUrl = `${supabaseUrl}/functions/v1/twilio-voice-handler?action=bridge&lead_phone=${encodeURIComponent(leadPhone)}`

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather numDigits="1" action="${bridgeUrl}" method="POST" timeout="10">
    <Say voice="alice">New lead: ${escapeXml(leadName)}, ZIP ${escapeXml(zip)}, ${home}, ${escapeXml(vehicles)} vehicles. Press 1 to connect.</Say>
  </Gather>
  <Say voice="alice">No input received. Goodbye.</Say>
  <Hangup/>
</Response>`

    return twimlResponse(twiml)
  }

  if (action === 'bridge') {
    // Agent pressed 1 — bridge the call to the lead
    const leadPhone = url.searchParams.get('lead_phone') || ''

    if (!leadPhone) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Error: no lead phone number provided.</Say>
  <Hangup/>
</Response>`
      return twimlResponse(twiml)
    }

    const callerIdNumber = Deno.env.get('TWILIO_PHONE_NUMBER') || ''

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting you now.</Say>
  <Dial callerId="${escapeXml(callerIdNumber)}" timeout="30">
    <Number>${escapeXml(leadPhone)}</Number>
  </Dial>
</Response>`

    // Log the connection in audit_log
    try {
      const supabase = createClient(supabaseUrl, supabaseKey)

      // Normalize the phone to 10-digit for consistent lookup
      const normalizedPhone = normalizePhoneForStorage(leadPhone)

      if (normalizedPhone) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('phone', normalizedPhone)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (lead) {
          await supabase
            .from('leads')
            .update({ call_connected: true, call_connected_at: new Date().toISOString() })
            .eq('id', lead.id)

          await supabase.from('audit_log').insert({
            event_type: 'CALL_CONNECTED',
            lead_id: lead.id,
            metadata: {},
          })
        }
      }
    } catch (err) {
      console.error('[TWILIO_VOICE_HANDLER] Error logging bridge:', err)
    }

    return twimlResponse(twiml)
  }

  if (action === 'status') {
    // Call status callback from Twilio
    if (req.method === 'POST') {
      try {
        const formData = await req.formData()
        const callStatus = formData.get('CallStatus')?.toString() || ''
        const callSid = formData.get('CallSid')?.toString() || ''

        console.log(`[TWILIO_VOICE_HANDLER] Call ${callSid} status: ${callStatus}`)
      } catch (err) {
        console.error('[TWILIO_VOICE_HANDLER] Status callback error:', err)
      }
    }

    return twimlResponse(`<?xml version="1.0" encoding="UTF-8"?><Response/>`)
  }

  // Unknown action
  return new Response(JSON.stringify({ error: 'Unknown action' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
})

// Escape special XML characters to prevent TwiML injection
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
