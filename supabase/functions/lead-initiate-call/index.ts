// Supabase Edge Function: lead-initiate-call
// POST /functions/v1/lead-initiate-call
// Invoked by pg_cron every minute. Processes call_queue rows where fire_after <= now().
// Claims rows via optimistic lock (pending → processing) to prevent double-firing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { sendSMS, formatPhoneUS, checkRequiredEnvVars, generateInternalToken } from '../_shared/twilio.ts'

const MAX_ATTEMPTS = 3

// Initiate outbound call via Twilio REST API
async function initiateCall(
  accountSid: string,
  authToken: string,
  from: string,
  to: string,
  twimlUrl: string,
  timeout: number = 20
): Promise<{ success: boolean; sid?: string; error?: string; code?: number }> {
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
    return { success: false, error: data.message || 'Twilio call failed', code: data.code }
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

  // Authenticate — only allow calls with service role key
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authHeader = req.headers.get('Authorization')
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Validate required env vars (AGENT_PHONE_NUMBER is now optional — falls back gracefully per-agency)
  const missingVar = checkRequiredEnvVars([
    'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY',
    'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER',
  ])
  if (missingVar) {
    console.error(`[LEAD_INITIATE_CALL] Missing required env var: ${missingVar}`)
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
  const ENV_AGENT_PHONE_NUMBER = Deno.env.get('AGENT_PHONE_NUMBER') || ''

  try {
    // Claim pending rows where fire_after <= now() (concurrency guard)
    const now = new Date().toISOString()
    const { data: claimed, error: claimError } = await supabase
      .from('call_queue')
      .update({ status: 'processing' })
      .eq('status', 'pending')
      .lte('fire_after', now)
      .select('*')

    if (claimError) throw claimError

    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No pending calls',
        processed: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Fetch agency config for each lead in the batch
    const leadIds = claimed.map(r => r.lead_id)
    const { data: leadAgencies } = await supabase
      .from('leads')
      .select('id, agency_id')
      .in('id', leadIds)

    const leadAgencyMap: Record<string, string> = {}
    if (leadAgencies) {
      for (const la of leadAgencies) {
        if (la.agency_id) leadAgencyMap[la.id] = la.agency_id
      }
    }

    // Fetch agency Twilio configs and branding
    const agencyIds = [...new Set(Object.values(leadAgencyMap))]
    const agencyMap: Record<string, { twilio_from_number: string | null; agent_cell_number: string | null; brand_name: string | null; agent_first_name: string | null }> = {}
    if (agencyIds.length > 0) {
      const { data: agencies } = await supabase
        .from('agencies')
        .select('id, twilio_from_number, agent_cell_number, brand_name, agent_first_name')
        .in('id', agencyIds)
      if (agencies) {
        for (const a of agencies) {
          agencyMap[a.id] = {
            twilio_from_number: a.twilio_from_number,
            agent_cell_number: a.agent_cell_number,
            brand_name: a.brand_name,
            agent_first_name: a.agent_first_name,
          }
        }
      }
    }

    let completed = 0
    let failed = 0

    for (const row of claimed) {
      const name = row.first_name || 'there'

      // Resolve per-agency Twilio numbers
      const agencyId = leadAgencyMap[row.lead_id]
      const agencyConfig = agencyId ? agencyMap[agencyId] : null
      const twilioFromNumber = agencyConfig?.twilio_from_number || ENV_TWILIO_PHONE_NUMBER
      const agentPhoneNumber = agencyConfig?.agent_cell_number || ENV_AGENT_PHONE_NUMBER

      try {
        // Build TwiML webhook URL for the whisper
        const whisperToken = await generateInternalToken(row.lead_id, TWILIO_AUTH_TOKEN)
        const voiceHandlerUrl = `${supabaseUrl}/functions/v1/twilio-voice-handler`
        const whisperParams = new URLSearchParams({
          action: 'whisper',
          lead_id: row.lead_id,
          token: whisperToken,
          lead_name: name,
          zip: row.zip || '',
          home: row.owns_home ? 'yes' : 'no',
          vehicles: (row.vehicle_count || 1).toString(),
          lead_phone: row.phone,
        })
        const twimlUrl = `${voiceHandlerUrl}?${whisperParams.toString()}`

        // Initiate call to agent
        const callResult = await initiateCall(
          TWILIO_ACCOUNT_SID,
          TWILIO_AUTH_TOKEN,
          twilioFromNumber,
          agentPhoneNumber,
          twimlUrl,
          20
        )

        if (callResult.success) {
          // Mark completed
          await supabase
            .from('call_queue')
            .update({ status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', row.id)

          // Update lead: call_initiated
          await supabase
            .from('leads')
            .update({ call_initiated: true, call_initiated_at: new Date().toISOString() })
            .eq('id', row.lead_id)

          // Log call message
          await supabase.from('lead_messages').insert({
            lead_id: row.lead_id,
            direction: 'outbound',
            channel: 'call',
            body: `Speed-to-call initiated to agent, bridging to ${row.phone}`,
            twilio_sid: callResult.sid,
            status: 'initiated',
          })

          // Audit log
          await supabase.from('audit_log').insert({
            event_type: 'CALL_INITIATED',
            lead_id: row.lead_id,
            metadata: { twilio_sid: callResult.sid },
          })

          completed++
        } else {
          throw new Error(callResult.error || 'Call initiation failed')
        }
      } catch (err) {
        const errorMessage = err.message || 'Unknown error'
        const newAttempts = row.attempts + 1

        if (newAttempts >= MAX_ATTEMPTS) {
          // Mark failed permanently
          await supabase
            .from('call_queue')
            .update({
              status: 'failed',
              attempts: newAttempts,
              last_error: errorMessage,
              completed_at: new Date().toISOString(),
            })
            .eq('id', row.id)

          // Send fallback "missed you" SMS with agency branding
          const agentDisplayName = agencyConfig?.agent_first_name || 'Your agent'
          const missedBody =
            `Hey ${name}, ${agentDisplayName} just tried calling but missed you! I've got your quotes ready. What's a good time to chat tomorrow? Or reply here and I can text you your estimate.`

          const followUpResult = await sendSMS(
            TWILIO_ACCOUNT_SID,
            TWILIO_AUTH_TOKEN,
            twilioFromNumber,
            row.phone,
            missedBody
          )

          // Log the fallback SMS
          await supabase.from('lead_messages').insert({
            lead_id: row.lead_id,
            direction: 'outbound',
            channel: 'sms',
            body: missedBody,
            twilio_sid: followUpResult.sid || null,
            status: followUpResult.success ? 'sent' : 'failed',
          })

          // Audit log
          await supabase.from('audit_log').insert({
            event_type: 'CALL_MISSED',
            lead_id: row.lead_id,
            metadata: {
              error: errorMessage,
              attempts: newAttempts,
              followup_sms_sent: followUpResult.success,
            },
          })

          failed++
        } else {
          // Return to pending for retry
          await supabase
            .from('call_queue')
            .update({
              status: 'pending',
              attempts: newAttempts,
              last_error: errorMessage,
            })
            .eq('id', row.id)

          failed++
        }
      }
    }

    console.log(`[LEAD_INITIATE_CALL] Processed ${claimed.length} rows: ${completed} completed, ${failed} failed`)

    return new Response(JSON.stringify({
      success: true,
      processed: claimed.length,
      completed,
      failed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[LEAD_INITIATE_CALL] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
