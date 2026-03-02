// Supabase Edge Function: twilio-voice-handler
// Returns TwiML XML for the speed-to-call bridge flow
// Called by Twilio as a webhook when processing voice calls
//
// Endpoints (via query params):
//   ?action=whisper  — Plays lead info whisper to agent, gathers digit "1" to connect
//   ?action=bridge   — Dials the lead's phone to complete the call bridge
//   ?action=status   — Handles call status callbacks (completed, no-answer, etc.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TwiML response helper
function twimlResponse(twiml: string): Response {
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (action === 'whisper') {
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

    // Also parse from POST body (Twilio sends form data)
    let digits = ''
    if (req.method === 'POST') {
      try {
        const formData = await req.formData()
        digits = formData.get('Digits')?.toString() || ''
      } catch {
        // Query param fallback — digits not required for direct bridge
      }
    }

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

      // Find lead by phone to log the connection
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('phone', leadPhone.replace('+1', '').replace('+', ''))
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
          metadata: { lead_phone: leadPhone },
        })
      }
    } catch (err) {
      console.error('[TWILIO_VOICE_HANDLER] Error logging bridge:', err)
    }

    return twimlResponse(twiml)
  }

  if (action === 'status') {
    // Call status callback from Twilio
    // Twilio sends POST with form-encoded data
    if (req.method === 'POST') {
      try {
        const formData = await req.formData()
        const callStatus = formData.get('CallStatus')?.toString() || ''
        const callSid = formData.get('CallSid')?.toString() || ''

        console.log(`[TWILIO_VOICE_HANDLER] Call ${callSid} status: ${callStatus}`)

        // If the call was not answered, we could trigger follow-up logic here
        // For now, just log it — the lead-notify-sms function handles the no-answer case
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
