// Supabase Edge Function: bland-cancel-webhook
// POST /functions/v1/bland-cancel-webhook
// Called by Bland.ai on call_ended event.
// Writes outcome, assignment, followup deadline, cost to pending_cases + ai_call_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars } from '../_shared/twilio.ts'

interface AnalysisSchema {
  call_outcome?: string
  payment_promise_date?: string
  callback_confirmed?: boolean
}

interface BlandWebhookPayload {
  call_id: string
  completed: boolean
  answered_by: string
  call_length: number
  concatenated_transcript: string
  analysis: string
  analysis_schema?: AnalysisSchema
  metadata: {
    policy_id: string
    agency_id: string
    call_type?: string
    customer_first_name: string
    customer_name: string
    policy_no: string
    product?: string
    cancel_effective_date?: string
    amount_due?: string
    premium_at_risk?: string
  }
  variables?: {
    autodial_consent?: string
    consent_captured?: string
    opt_out_requested?: string
  }
}

function resolveOutcome(body: BlandWebhookPayload): string {
  const schema = body.analysis_schema
  if (schema?.call_outcome) return schema.call_outcome

  // Fallback
  const analysis = (body.analysis || '').toLowerCase()
  const t = (body.concatenated_transcript || '').toLowerCase()

  if (body.answered_by === 'voicemail') return 'voicemail'
  if (body.answered_by === 'no-answer' || !body.completed) return 'no_answer'
  if (body.variables?.opt_out_requested === 'true') return 'opt_out_requested'
  if (t.includes('wrong number')) return 'wrong_number'
  if (t.includes('already paid') || t.includes('payment made')) return 'payment_made'
  if (t.includes('will pay') || t.includes('send it') || t.includes('i can pay')) return 'payment_promised'
  if (t.includes('cancel') || t.includes("don't want it")) return 'intentional_cancel'
  if (t.includes('claim') || t.includes('accident')) return 'claims_dispute'
  return 'no_answer'
}

function resolveFollowupReason(outcome: string): string | null {
  switch (outcome) {
    case 'payment_plan_requested': return 'payment_plan'
    case 'claims_dispute':         return 'claims_dispute'
    case 'rate_shock_escalated':   return 'rate_shock'
    case 'callback_scheduled':     return 'manual'
    case 'wrong_number':           return 'wrong_number'
    case 'intentional_cancel':     return null
    case 'payment_promised':       return null
    case 'payment_made':           return null
    default:                       return null
  }
}

function resolveAssignment(followupReason: string | null, env: Record<string, string>): string | null {
  if (!followupReason) return null
  const { TRACY_EMPLOYEE_ID: t, CINDY_EMPLOYEE_ID: c, CAMERON_EMPLOYEE_ID: cam } = env
  switch (followupReason) {
    case 'rate_shock': case 'manual':
      return t || cam || null
    case 'claims_dispute':
      return cam || null
    case 'payment_plan': case 'wrong_number':
      return c || cam || null
    default:
      return cam || null
  }
}

function resolveFollowupDueBy(followupReason: string | null, cancelDate: string | null, now: Date): string | null {
  if (!followupReason) return null

  const eodUTC = new Date(now)
  eodUTC.setUTCHours(22, 0, 0, 0)
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  // Urgent: cancel within 7 days
  if (cancelDate) {
    const daysUntil = Math.ceil((new Date(cancelDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 7) return eodUTC.toISOString()
  }

  if (['rate_shock', 'claims_dispute'].includes(followupReason)) return eodUTC.toISOString()
  if (['payment_plan', 'manual'].includes(followupReason)) return in48h.toISOString()
  return in72h.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // Webhook secret validation
  const BLAND_WEBHOOK_SECRET = Deno.env.get('BLAND_CANCEL_WEBHOOK_SECRET') || Deno.env.get('BLAND_WEBHOOK_SECRET')
  if (BLAND_WEBHOOK_SECRET && req.headers.get('x-bland-webhook-secret') !== BLAND_WEBHOOK_SECRET) {
    console.error('[BLAND_CANCEL_WEBHOOK] Invalid webhook secret')
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const missingVar = checkRequiredEnvVars(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
  if (missingVar) return new Response(JSON.stringify({ error: `Missing config: ${missingVar}` }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  let body: BlandWebhookPayload
  try { body = await req.json() }
  catch { return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }) }

  const { policy_id, agency_id } = body.metadata || {}
  if (!policy_id || !agency_id) return new Response(JSON.stringify({ error: 'Missing required metadata' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const envStaff = {
    TRACY_EMPLOYEE_ID: Deno.env.get('TRACY_EMPLOYEE_ID') || '',
    CINDY_EMPLOYEE_ID: Deno.env.get('CINDY_EMPLOYEE_ID') || '',
    CAMERON_EMPLOYEE_ID: Deno.env.get('CAMERON_EMPLOYEE_ID') || '',
  }
  const AI_COST_PER_MIN = parseFloat(Deno.env.get('AI_CALL_COST_PER_MINUTE') || '0.10')

  try {
    const outcome = resolveOutcome(body)
    const transcript = body.concatenated_transcript || ''
    const optOut = body.variables?.opt_out_requested === 'true'
    const now = new Date()
    const nowISO = now.toISOString()

    // Fetch current case state
    const { data: current, error: fetchError } = await supabase
      .from('pending_cases')
      .select('attempt_count, phone, customer_name, cancel_effective_date')
      .eq('id', policy_id).eq('agency_id', agency_id).single()

    if (fetchError || !current) {
      return new Response(JSON.stringify({ error: 'Policy not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const newAttempts = (current.attempt_count || 0) + 1
    const followupReason = resolveFollowupReason(outcome)
    const needsFollowup = !!followupReason
    const assignedTo = needsFollowup ? resolveAssignment(followupReason, envStaff) : null
    const cancelStatus =
      outcome === 'payment_promised'       ? 'promise_to_pay'   :
      outcome === 'payment_made'           ? 'saved'            :
      outcome === 'intentional_cancel'     ? 'requested_cancellation' :
      outcome === 'claims_dispute'         ? 'pending'          :
      outcome === 'payment_plan_requested' ? 'payment_plan_requested' :
      'contacted'
    const followupDueBy = needsFollowup ? resolveFollowupDueBy(followupReason, current.cancel_effective_date, now) : null
    const callLengthSec = body.call_length || 0
    const estimatedCost = parseFloat(((callLengthSec / 60) * AI_COST_PER_MIN).toFixed(4))
    const consentCaptured = body.variables?.consent_captured === 'true'
    const autodialConsent = body.variables?.autodial_consent === 'true'

    // 1. Update pending_cases
    const { error: updateError } = await supabase
      .from('pending_cases')
      .update({
        last_contact_date: nowISO,
        last_contact_outcome: outcome,
        last_contact_channel: 'ai_voice',
        ai_transcript: transcript || null,
        attempt_count: newAttempts,
        status: cancelStatus,
        human_followup_required: needsFollowup,
        followup_reason: followupReason,
        assigned_to_id: assignedTo,
        followup_due_by: followupDueBy,
        updated_at: nowISO,
      })
      .eq('id', policy_id)
      .eq('agency_id', agency_id)
    if (updateError) throw updateError

    // 2. Write ai_call_log (non-fatal, idempotent via bland_call_id UNIQUE)
    // Bland.ai may retry the webhook up to 3 times — upsert prevents duplicate rows.
    await supabase.from('ai_call_log').upsert({
      agency_id,
      policy_id,
      bland_call_id: body.call_id,
      call_type: 'cancel',
      call_outcome: outcome,
      call_length_seconds: callLengthSec,
      estimated_cost_usd: estimatedCost,
      callback_confirmed: body.analysis_schema?.callback_confirmed || false,
      consent_captured: consentCaptured,
      autodial_consent_result: consentCaptured ? autodialConsent : null,
      opt_out: optOut,
      assigned_to: assignedTo,
      followup_reason: followupReason,
      called_at: nowISO,
    }, { onConflict: 'bland_call_id' }).then(({ error }) => { if (error) console.error('[BLAND_CANCEL_WEBHOOK] ai_call_log upsert error:', error) })

    // 3. Opt-out → DNC (CRITICAL — legal compliance)
    if (optOut && current.phone) {
      const { error: dncError } = await supabase.from('customer_consent').upsert({
        agency_id,
        customer_phone: current.phone,
        customer_name: current.customer_name,
        dnc: true,
        dnc_date: nowISO,
        dnc_source: 'call_request',
        dnc_notes: 'Customer requested no further calls during AI cancel call',
        autodial_consent: false,
        autodial_opt_out_date: nowISO,
        autodial_opt_out_channel: 'verbal',
        updated_at: nowISO,
      }, { onConflict: 'agency_id,customer_phone' })
      if (dncError) console.error('[BLAND_CANCEL_WEBHOOK] CRITICAL: DNC upsert failed:', dncError)
    }

    // 4. Consent capture (non opt-out)
    if (!optOut && consentCaptured && current.phone) {
      const cu: Record<string, unknown> = {
        agency_id,
        customer_phone: current.phone,
        customer_name: current.customer_name,
        autodial_consent: autodialConsent,
        updated_at: nowISO,
      }
      if (autodialConsent) {
        cu.autodial_consent_date = nowISO
        cu.autodial_consent_source = 'ai_voice'
      } else {
        cu.autodial_opt_out_date = nowISO
        cu.autodial_opt_out_channel = 'verbal'
      }
      await supabase.from('customer_consent').upsert(cu, { onConflict: 'agency_id,customer_phone' })
        .then(({ error }) => { if (error) console.error('[BLAND_CANCEL_WEBHOOK] Consent upsert error:', error) })
    }

    // 5. Attempt cap → assign Cindy for manual follow-up
    if (newAttempts >= 3 && ['no_answer', 'voicemail'].includes(outcome)) {
      if (envStaff.CINDY_EMPLOYEE_ID) {
        await supabase.from('pending_cases').update({
          human_followup_required: true,
          followup_reason: 'no_response',
          assigned_to_id: envStaff.CINDY_EMPLOYEE_ID,
          followup_due_by: resolveFollowupDueBy('no_response', current.cancel_effective_date, now),
          human_only: true,
          human_only_reason: 'attempt_cap',
          updated_at: nowISO,
        }).eq('id', policy_id).eq('agency_id', agency_id)
      }
    }

    console.log(`[BLAND_CANCEL_WEBHOOK] ${body.call_id} → ${outcome} | policy: ${policy_id} | assigned: ${assignedTo || 'none'} | $${estimatedCost}`)

    return new Response(JSON.stringify({
      success: true,
      call_id: body.call_id,
      policy_id,
      outcome,
      followup_reason: followupReason,
      assigned_to: assignedTo,
      followup_due_by: followupDueBy,
      estimated_cost_usd: estimatedCost,
      opt_out_processed: optOut,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error) {
    console.error('[BLAND_CANCEL_WEBHOOK] Unhandled error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
