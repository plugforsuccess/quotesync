// Shared helper: send-canopy-link
// Sends the Canopy Connect upload link to a lead via Twilio SMS.
// Imported by bland-webhook after qualification.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendSMS, formatPhoneUS } from './twilio.ts'

interface SendCanopyLinkParams {
  lead_id: string
  phone_number: string // 10-digit canonical or E.164
  supabase: ReturnType<typeof createClient>
}

export async function sendCanopyLink({
  lead_id,
  phone_number,
  supabase,
}: SendCanopyLinkParams): Promise<{ sent: boolean; reason?: string }> {
  // 1. Idempotency guard — check if already sent
  const { data: lead } = await supabase
    .from('leads')
    .select('id, canopy_link_sent, bland_call_transcript, agency_id')
    .eq('id', lead_id)
    .single()

  if (!lead) {
    return { sent: false, reason: 'lead_not_found' }
  }

  if (lead.canopy_link_sent === true) {
    return { sent: false, reason: 'already_sent' }
  }

  // 2. Guard: transcript must exist before sending link
  if (!lead.bland_call_transcript) {
    await supabase
      .from('leads')
      .update({ canopy_send_pending: true })
      .eq('id', lead_id)

    await supabase.from('audit_log').insert({
      event_type: 'CANOPY_SEND_DEFERRED_NO_TRANSCRIPT',
      lead_id,
      metadata: { reason: 'transcript_not_yet_available' },
    })

    return { sent: false, reason: 'no_transcript' }
  }

  // 3. Format phone
  const e164 = formatPhoneUS(phone_number)
  if (!e164) {
    return { sent: false, reason: 'invalid_phone' }
  }

  // 4. Get agency branding for Canopy URL
  let canopyUrl = Deno.env.get('CANOPY_CONNECT_URL') || ''
  let twilioFrom = Deno.env.get('TWILIO_PHONE_NUMBER')!

  if (lead.agency_id) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('canopy_connect_url, twilio_from_number')
      .eq('id', lead.agency_id)
      .single()

    if (agency?.canopy_connect_url) canopyUrl = agency.canopy_connect_url
    if (agency?.twilio_from_number) twilioFrom = agency.twilio_from_number
  }

  if (!canopyUrl) {
    return { sent: false, reason: 'no_canopy_url' }
  }

  // 5. Send SMS
  const smsBody =
    `Thanks for speaking with us! To get the most accurate quote, you can securely upload your current policy documents here: ${canopyUrl}\n\nThis helps us compare rates and find you the best coverage. It only takes about 60 seconds.`

  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')!
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')!

  const result = await sendSMS(accountSid, authToken, twilioFrom, e164, smsBody)

  if (!result.success) {
    console.error('[SEND_CANOPY_LINK] SMS failed:', result.error)
    return { sent: false, reason: `sms_failed: ${result.error}` }
  }

  // 6. Update lead
  await supabase
    .from('leads')
    .update({
      canopy_link_sent: true,
      canopy_link_sent_at: new Date().toISOString(),
    })
    .eq('id', lead_id)

  // 7. Log message and audit
  await supabase.from('lead_messages').insert({
    lead_id,
    direction: 'outbound',
    channel: 'sms',
    body: smsBody,
    twilio_sid: result.sid,
    status: 'sent',
  })

  await supabase.from('audit_log').insert({
    event_type: 'CANOPY_LINK_SENT_BLAND',
    lead_id,
    metadata: { twilio_sid: result.sid, source: 'bland_webhook' },
  })

  return { sent: true }
}
