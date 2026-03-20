// Supabase Edge Function: lead-sms-drip
// POST /functions/v1/lead-sms-drip
// Scheduled function (via pg_cron) that sends follow-up SMS to non-responsive leads.
// Rekeyed off Bland AI outcome columns — routes by drip scenario instead of call_connected.
// Drip stages: 0=initial, 1=T+2h, 2=T+24h, 3=T+72h (final)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendSMS, formatPhoneUS, checkRequiredEnvVars } from '../_shared/twilio.ts'
import { sendCanopyLink } from '../_shared/sendCanopyLink.ts'

// ── Scenario routing ────────────────────────────────────────────────────────

type DripScenario = 'never_reached' | 'called_declined_transfer' | 'callback_scheduled' | 'qualified_no_canopy' | null

function getDripScenario(lead: any): DripScenario {
  const status = lead.bland_outbound_status
  const qualified = lead.bland_qualified

  // SCENARIO A — never reached
  if (
    status === 'no-answer-final' ||
    status === 'failed' ||
    (status == null && new Date(lead.created_at) <= new Date(Date.now() - 30 * 60 * 1000))
  ) {
    return 'never_reached'
  }

  // SCENARIO B — called, qualified, declined transfer and no callback
  if (status === 'completed' && qualified === true) {
    if (lead.drip_scenario === 'called_declined_transfer') return 'called_declined_transfer'
  }

  // SCENARIO C — callback scheduled
  if (lead.drip_scenario === 'callback_scheduled') return 'callback_scheduled'

  // SCENARIO D — qualified, no Canopy link sent yet
  if (qualified === true && !lead.canopy_link_sent) {
    return 'qualified_no_canopy'
  }

  return null
}

const OFFICE_NUMBER = Deno.env.get('RINGCENTRAL_OFFICE_NUMBER') || 'your agent'
const SITE_URL = 'insuredbycam.com'

function getDripMessage(scenario: DripScenario, firstName: string, zip: string): string | null {
  const name = firstName || 'there'
  switch (scenario) {
    case 'never_reached':
      return `Hi ${name}, we tried calling but missed you! We have some great options for auto and home coverage in Georgia. When's a good time to connect? Reply here or call us at ${OFFICE_NUMBER}. Reply STOP to opt out.`
    case 'called_declined_transfer':
      return `Hi ${name}, thanks for chatting with us earlier! Whenever you're ready to take a look at your options, we're here. Reply to this message or visit ${SITE_URL}. Reply STOP to opt out.`
    case 'callback_scheduled':
      return `Hi ${name}, just a reminder that we have a callback scheduled for you. Looking forward to connecting! Reply here if you need to reschedule. Reply STOP to opt out.`
    case 'qualified_no_canopy':
      return null // handled separately — triggers Canopy link send, not a plain SMS
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

  // Authenticate — only allow calls with service role key (pg_cron passes this)
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
    'RINGCENTRAL_OFFICE_NUMBER',
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
  const ENV_TWILIO_PHONE_NUMBER = Deno.env.get('TWILIO_PHONE_NUMBER')!

  try {
    // Query leads eligible for drip messages — rekeyed off Bland outcome columns
    const { data: leads, error: queryError } = await supabase
      .from('leads')
      .select(`
        id, first_name, phone, zip, drip_stage, drip_scenario,
        created_at, sms_sent_at, agency_id,
        bland_outbound_status, bland_qualified, bland_partial_capture,
        canopy_link_sent, canopy_link_sent_at
      `)
      .eq('sms_opted_out', false)
      .not('status', 'in', '("bound","disqualified","duplicate","transferred","contacted")')
      .eq('bland_partial_capture', false)        // never drip partial captures
      .lt('drip_stage', 3)
      .not('phone', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    if (queryError) throw queryError

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Pre-fetch agency Twilio configs for all unique agency_ids in this batch
    const agencyIds = [...new Set(leads.map(l => l.agency_id).filter(Boolean))]
    const agencyMap: Record<string, { twilio_from_number: string | null }> = {}
    if (agencyIds.length > 0) {
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, twilio_from_number')
        .in('id', agencyIds)
      if (agencies) {
        for (const a of agencies) {
          agencyMap[a.id] = { twilio_from_number: a.twilio_from_number }
        }
      }
    }

    const now = Date.now()
    let processed = 0
    let sent = 0

    for (const lead of leads) {
      const scenario = getDripScenario(lead)
      if (!scenario) continue

      // SCENARIO D: send Canopy link instead of SMS
      if (scenario === 'qualified_no_canopy' && !lead.canopy_link_sent && lead.phone) {
        try {
          await sendCanopyLink({ lead_id: lead.id, phone_number: lead.phone, supabase })
          // sendCanopyLink handles its own audit logging
        } catch (err) {
          console.error(`[SMS_DRIP] Canopy link failed for lead ${lead.id}:`, err)
        }
        continue
      }

      // Check timing threshold
      const baseTime = lead.sms_sent_at
        ? new Date(lead.sms_sent_at).getTime()
        : new Date(lead.created_at).getTime()
      const elapsed = now - baseTime
      const nextStage = lead.drip_stage + 1
      const threshold = DRIP_THRESHOLDS[nextStage]
      if (!threshold || elapsed < threshold) continue

      const message = getDripMessage(scenario, lead.first_name, lead.zip)
      if (!message) continue

      processed++

      const formattedPhone = formatPhoneUS(lead.phone)
      if (!formattedPhone) {
        console.error(`[SMS_DRIP] Invalid phone for lead ${lead.id}`)
        continue
      }

      // Resolve per-agency Twilio number, falling back to env var
      const agencyConfig = lead.agency_id ? agencyMap[lead.agency_id] : null
      const twilioFromNumber = agencyConfig?.twilio_from_number || ENV_TWILIO_PHONE_NUMBER

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
        twilioFromNumber,
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
          metadata: { drip_stage: nextStage, scenario, twilio_sid: smsResult.sid },
        })
      } else {
        console.error(`[SMS_DRIP] Failed to send drip ${nextStage} to lead ${lead.id}:`, smsResult.error, 'code:', smsResult.code)

        // Log failure to audit_log
        await supabase.from('audit_log').insert({
          event_type: 'SMS_DRIP_FAILED',
          lead_id: lead.id,
          metadata: { drip_stage: nextStage, scenario, error: smsResult.error, code: smsResult.code },
        })

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
