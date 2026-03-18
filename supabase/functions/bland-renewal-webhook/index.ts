// Supabase Edge Function: bland-renewal-webhook
// POST /functions/v1/bland-renewal-webhook
// Called by Bland.ai on call_ended event.
// Writes outcome, assignment, followup deadline, cost to renewal_policies + ai_call_log.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { checkRequiredEnvVars } from '../_shared/twilio.ts'

type ContactOutcome = 'no_answer' | 'confirmed' | 'hesitant' | 'shopping' | 'escalated' | 'left_voicemail' | 'wrong_number' | 'third_party_answer'

interface AnalysisSchema {
  call_outcome?: string
  customer_intent?: string
  service_changes_requested?: string[]
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
    customer_group_id?: string
    customer_first_name: string
    customer_name: string
    policy_number: string
    customer_phone?: string
    renewal_date?: string
  }
  variables?: {
    autodial_consent?: string
    consent_captured?: string
    opt_out_requested?: string
  }
}

function resolveOutcome(body: BlandWebhookPayload): ContactOutcome {
  const schema = body.analysis_schema
  if (schema?.call_outcome) {
    const o = schema.call_outcome
    if (o === 'confirmed') return 'confirmed'
    if (o === 'hesitant' || o === 'address_discrepancy' || o === 'eft_lapse') return 'hesitant'
    if (o === 'shopping') return 'shopping'
    if (['rate_shock_escalated', 'callback_scheduled', 'out_of_scope_escalated', 'opt_out_requested'].includes(o)) return 'escalated'
    if (o === 'wrong_number') return 'wrong_number'
    if (o === 'third_party_answer') return 'third_party_answer'
    if (o === 'voicemail') return 'left_voicemail'
    if (o === 'no_answer') return 'no_answer'
  }

  // Fallback: keyword matching on transcript/analysis
  const analysis = (body.analysis || '').toLowerCase()
  const t = (body.concatenated_transcript || '').toLowerCase()

  if (body.answered_by === 'voicemail') return 'left_voicemail'
  if (body.answered_by === 'no-answer' || !body.completed) return 'no_answer'
  if (body.variables?.opt_out_requested === 'true') return 'escalated'
  if (analysis.includes('wrong number') || t.includes('wrong number')) return 'wrong_number'
  if (analysis.includes('third party') || t.includes("she's not here") || t.includes("he's not here")) return 'third_party_answer'
  if (analysis.includes('shopping') || t.includes('shopping around') || t.includes('getting other quotes')) return 'shopping'
  if (analysis.includes('escalat') || analysis.includes('rate shock') || t.includes('way too high') || t.includes('talk to cameron')) return 'escalated'
  if (analysis.includes('hesitant') || t.includes('i guess') || t.includes('not sure')) return 'hesitant'
  if (analysis.includes('confirmed') || t.includes('sounds good') || t.includes('yes')) return 'confirmed'

  return 'no_answer'
}

function resolveFollowupReason(outcome: ContactOutcome, body: BlandWebhookPayload): string | null {
  const schema = body.analysis_schema
  const t = (body.concatenated_transcript || '').toLowerCase()

  if (schema?.call_outcome === 'address_discrepancy' || schema?.service_changes_requested?.includes('address_update')) return 'address_discrepancy'
  if (schema?.call_outcome === 'eft_lapse' || schema?.service_changes_requested?.some(s => s.includes('eft'))) return 'eft_lapse'
  if (schema?.call_outcome === 'rate_shock_escalated') return 'rate_shock'
  if (schema?.call_outcome === 'shopping') return 'shopping'
  if (schema?.call_outcome === 'opt_out_requested') return null

  switch (outcome) {
    case 'shopping': return 'shopping'
    case 'wrong_number': return 'wrong_number'
    case 'hesitant':
      if (t.includes('address')) return 'address_discrepancy'
      if (t.includes('autopay') || t.includes('eft')) return 'eft_lapse'
      return 'hesitant'
    case 'escalated':
      if (t.includes('too high') || t.includes('too much')) return 'rate_shock'
      if (t.includes('address')) return 'address_discrepancy'
      if (t.includes('autopay') || t.includes('eft')) return 'eft_lapse'
      return 'manual'
    default: return null
  }
}

function resolveAssignment(followupReason: string | null, env: Record<string, string>): string | null {
  if (!followupReason) return null
  const { TRACY_EMPLOYEE_ID: t, CINDY_EMPLOYEE_ID: c, CAMERON_EMPLOYEE_ID: cam } = env
  switch (followupReason) {
    case 'rate_shock': case 'shopping': case 'hesitant': case 'multi_policy': case 'manual':
      return t || cam || null
    case 'address_discrepancy': case 'eft_lapse': case 'wrong_number': case 'no_response': case 'amount_due':
      return c || cam || null
    default:
      return cam || null
  }
}

function resolveFollowupDueBy(followupReason: string | null, renewalDate: string | null, now: Date): string | null {
  if (!followupReason) return null

  const eodUTC = new Date(now)
  eodUTC.setUTCHours(22, 0, 0, 0) // ~5-6PM ET
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const in72h = new Date(now.getTime() + 72 * 60 * 60 * 1000)

  // Urgent: renewal within 15 days
  if (renewalDate) {
    const daysUntil = Math.ceil((new Date(renewalDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    if (daysUntil <= 15) return eodUTC.toISOString()
  }

  if (['rate_shock', 'shopping'].includes(followupReason)) return eodUTC.toISOString()
  if (['address_discrepancy', 'eft_lapse', 'hesitant', 'manual'].includes(followupReason)) return in48h.toISOString()
  return in72h.toISOString()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // Webhook secret validation
  const BLAND_WEBHOOK_SECRET = Deno.env.get('BLAND_WEBHOOK_SECRET')
  if (BLAND_WEBHOOK_SECRET && req.headers.get('x-bland-webhook-secret') !== BLAND_WEBHOOK_SECRET) {
    console.error('[BLAND_RENEWAL_WEBHOOK] Invalid webhook secret')
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

    // Fetch current policy state
    const { data: current, error: fetchError } = await supabase
      .from('renewal_policies')
      .select('contact_attempts, customer_phone, customer_name, renewal_date')
      .eq('id', policy_id).eq('agency_id', agency_id).single()

    if (fetchError || !current) {
      return new Response(JSON.stringify({ error: 'Policy not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const newAttempts = (current.contact_attempts || 0) + 1
    const needsFollowup = ['shopping', 'escalated', 'hesitant', 'wrong_number'].includes(outcome)
    const followupReason = resolveFollowupReason(outcome, body)
    const assignedTo = needsFollowup ? resolveAssignment(followupReason, envStaff) : null
    const renewalStatus = outcome === 'confirmed' ? 'confirmed' : outcome === 'shopping' ? 'at_risk' : outcome === 'escalated' ? 'escalated' : 'contacted'
    const followupDueBy = needsFollowup ? resolveFollowupDueBy(followupReason, current.renewal_date, now) : null
    const callLengthSec = body.call_length || 0
    const estimatedCost = parseFloat(((callLengthSec / 60) * AI_COST_PER_MIN).toFixed(4))
    const consentCaptured = body.variables?.consent_captured === 'true'
    const autodialConsent = body.variables?.autodial_consent === 'true'

    // 1. Update renewal_policies
    const updateData: Record<string, unknown> = {
      last_contact_date: nowISO,
      last_contact_outcome: outcome,
      last_contact_channel: 'ai_voice',
      ai_transcript: transcript || null,
      contact_attempts: newAttempts,
      renewal_status: renewalStatus,
      human_followup_required: needsFollowup,
      followup_reason: followupReason,
      assigned_to: assignedTo,
      followup_due_by: followupDueBy,
      updated_at: nowISO,
    }

    const { error: updateError } = await supabase
      .from('renewal_policies')
      .update(updateData)
      .eq('id', policy_id)
      .eq('agency_id', agency_id)
    if (updateError) throw updateError

    // 2. Write ai_call_log (non-fatal)
    await supabase.from('ai_call_log').insert({
      agency_id,
      policy_id,
      bland_call_id: body.call_id,
      call_outcome: body.analysis_schema?.call_outcome || outcome,
      call_length_seconds: callLengthSec,
      estimated_cost_usd: estimatedCost,
      callback_confirmed: body.analysis_schema?.callback_confirmed || false,
      consent_captured: consentCaptured,
      autodial_consent_result: consentCaptured ? autodialConsent : null,
      opt_out: optOut,
      assigned_to: assignedTo,
      followup_reason: followupReason,
      called_at: nowISO,
    }).then(({ error }) => { if (error) console.error('[BLAND_RENEWAL_WEBHOOK] ai_call_log insert error:', error) })

    // 3. Opt-out → DNC (CRITICAL — legal compliance)
    if (optOut && current.customer_phone) {
      const { error: dncError } = await supabase.from('customer_consent').upsert({
        agency_id,
        customer_phone: current.customer_phone,
        customer_name: current.customer_name,
        dnc: true,
        dnc_date: nowISO,
        dnc_source: 'call_request',
        dnc_notes: 'Customer requested no further calls during AI renewal call',
        autodial_consent: false,
        autodial_opt_out_date: nowISO,
        autodial_opt_out_channel: 'verbal',
        updated_at: nowISO,
      }, { onConflict: 'agency_id,customer_phone' })
      if (dncError) console.error('[BLAND_RENEWAL_WEBHOOK] CRITICAL: DNC upsert failed:', dncError)
    }

    // 4. Consent capture (non opt-out)
    if (!optOut && consentCaptured && current.customer_phone) {
      const cu: Record<string, unknown> = {
        agency_id,
        customer_phone: current.customer_phone,
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
        .then(({ error }) => { if (error) console.error('[BLAND_RENEWAL_WEBHOOK] Consent upsert error:', error) })
    }

    // 5. Attempt cap → group ineligible + assign Cindy
    if (newAttempts >= 3 && ['no_answer', 'left_voicemail'].includes(outcome) && body.metadata.customer_group_id) {
      await supabase.from('customer_renewal_groups')
        .update({ ai_eligible: false, updated_at: nowISO })
        .eq('id', body.metadata.customer_group_id).eq('agency_id', agency_id)
      if (envStaff.CINDY_EMPLOYEE_ID) {
        await supabase.from('renewal_policies').update({
          human_followup_required: true,
          followup_reason: 'no_response',
          assigned_to: envStaff.CINDY_EMPLOYEE_ID,
          followup_due_by: resolveFollowupDueBy('no_response', current.renewal_date, now),
          updated_at: nowISO,
        }).eq('id', policy_id).eq('agency_id', agency_id)
      }
    }

    // 6. Update group status (non-fatal)
    const groupId = body.metadata?.customer_group_id
    if (groupId) {
      const gs = renewalStatus === 'confirmed' ? 'confirmed' : renewalStatus === 'escalated' ? 'escalated' : renewalStatus === 'at_risk' ? 'at_risk' : 'contacted'
      await supabase.from('customer_renewal_groups')
        .update({ group_contact_status: gs, last_contact_date: nowISO, updated_at: nowISO })
        .eq('id', groupId).eq('agency_id', agency_id)
        .then(({ error }) => { if (error) console.error('[BLAND_RENEWAL_WEBHOOK] Group update error:', error) })
    }

    console.log(`[BLAND_RENEWAL_WEBHOOK] ${body.call_id} → ${outcome} | policy: ${policy_id} | assigned: ${assignedTo || 'none'} | $${estimatedCost}`)

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
    console.error('[BLAND_RENEWAL_WEBHOOK] Unhandled error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message || 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
