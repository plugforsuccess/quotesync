// Supabase Edge Function: lead-sms-drip
// POST /functions/v1/lead-sms-drip
// Scheduled function (via pg_cron) that sends follow-up SMS to non-responsive leads
// Drip stages: 0=initial, 1=T+2h, 2=T+24h, 3=T+72h (final)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendSMS, formatPhoneUS, checkRequiredEnvVars } from '../_shared/twilio.ts'

// Drip message templates
function getDripMessage(
  stage: number,
  firstName: string,
  zip: string
): string | null {
  const name = firstName || 'there'
  switch (stage) {
    case 1:
      return `${name}, your quote estimate is ready. Reply QUOTE to get your numbers, or I can call at a time that works for you. Reply STOP to opt out.`
    case 2:
      return `Hey ${name}, just a heads up — I found some bundle discounts for your area (${zip}). These change monthly. Want me to lock in your rate? Reply STOP to opt out.`
    case 3:
      return `Last check-in, ${name}. I've got your personalized quote saved. Reply YES if you'd like me to walk you through it, or STOP to opt out.`
    default:
      return null
  }
}

// Time thresholds for each drip stage (in milliseconds)
const DRIP_THRESHOLDS: Record<number, number> = {
  1: 2 * 60 * 60 * 1000,      // 2 hours
  2: 24 * 60 * 60 * 1000,     // 24 hours
  3: 72 * 60 * 60 * 1000,     // 72 hours
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

  // Validate required env vars
  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  ])
  if (missingVar) {
    console.error(`[SMS_DRIP] Missing required env var: ${missingVar}`)
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
  const TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!

  try {
    // Query leads eligible for drip messages:
    // - SMS was sent (initial contact made)
    // - Call not connected (or no response yet)
    // - Not opted out
    // - Status is still 'new' (hasn't progressed)
    // - Drip stage < 3 (haven't exhausted all drip messages)
    // - Has a phone number
    const { data: leads, error: queryError } = await supabase
      .from('leads')
      .select('id, first_name, phone, zip, drip_stage, created_at')
      .eq('sms_sent', true)
      .eq('call_connected', false)
      .eq('sms_opted_out', false)
      .eq('status', 'new')
      .lt('drip_stage', 3)
      .not('phone', 'is', null)

    if (queryError) throw queryError

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = Date.now()
    let processed = 0
    let sent = 0

    for (const lead of leads) {
      const createdAt = new Date(lead.created_at).getTime()
      const elapsed = now - createdAt
      const nextStage = lead.drip_stage + 1

      // Check if enough time has passed for the next drip stage
      const threshold = DRIP_THRESHOLDS[nextStage]
      if (!threshold || elapsed < threshold) {
        continue
      }

      processed++

      const formattedPhone = formatPhoneUS(lead.phone)
      if (!formattedPhone) {
        console.error(`[SMS_DRIP] Invalid phone for lead ${lead.id}`)
        continue
      }

      const message = getDripMessage(nextStage, lead.first_name, lead.zip)
      if (!message) continue

      // Optimistic lock: claim the lead by updating drip_stage first.
      // Uses eq on current drip_stage as a concurrency guard — if another
      // invocation already advanced this lead, the update will match 0 rows.
      const { count: updated } = await supabase
        .from('leads')
        .update({ drip_stage: nextStage })
        .eq('id', lead.id)
        .eq('drip_stage', lead.drip_stage)

      if (!updated || updated === 0) {
        // Another invocation already processed this lead — skip
        continue
      }

      const smsResult = await sendSMS(
        TWILIO_ACCOUNT_SID,
        TWILIO_AUTH_TOKEN,
        TWILIO_PHONE_NUMBER,
        formattedPhone,
        message
      )

      if (smsResult.success) {
        sent++

        // Log message
        await supabase.from('lead_messages').insert({
          lead_id: lead.id,
          direction: 'outbound',
          channel: 'sms',
          body: message,
          twilio_sid: smsResult.sid,
          status: 'sent',
        })

        // Audit log
        await supabase.from('audit_log').insert({
          event_type: 'SMS_DRIP_SENT',
          lead_id: lead.id,
          metadata: { drip_stage: nextStage, twilio_sid: smsResult.sid },
        })
      } else {
        console.error(`[SMS_DRIP] Failed to send drip ${nextStage} to lead ${lead.id}:`, smsResult.error, 'code:', smsResult.code)

        // Roll back drip_stage on SMS failure so next run retries
        await supabase
          .from('leads')
          .update({ drip_stage: lead.drip_stage })
          .eq('id', lead.id)
      }
    }

    return new Response(JSON.stringify({
      success: true,
      eligible: leads.length,
      processed,
      sent,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[SMS_DRIP] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
