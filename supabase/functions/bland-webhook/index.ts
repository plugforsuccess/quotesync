// Supabase Edge Function: bland-webhook
// POST /functions/v1/bland-webhook
// Handles all Bland AI webhook payloads (call_ended event for both inbound and outbound).
// Always returns 200 to Bland after processing.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendCanopyLink } from '../_shared/sendCanopyLink.ts'
import { normalizePhoneForStorage } from '../_shared/twilio.ts'

// ── Signature verification ──────────────────────────────────────────────────

async function verifyBlandSignature(
  req: Request,
  secret: string
): Promise<boolean> {
  const signature = req.headers.get('X-Bland-Signature')
  if (!signature) return false

  const body = await req.clone().text()
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)))

  return signature === expected
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function logAudit(
  supabase: any,
  eventType: string,
  leadId: string | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    await supabase.from('audit_log').insert({
      event_type: eventType,
      lead_id: leadId,
      metadata,
    })
  } catch (err) {
    console.error(`[BLAND_WEBHOOK] Audit log failed for ${eventType}:`, err)
  }
}

function parseVar(variables: Record<string, any> | null, key: string): string | null {
  if (!variables) return null
  const val = variables[key]
  if (val === undefined || val === null || val === '') return null
  return String(val)
}

function parseBoolVar(variables: Record<string, any> | null, key: string): boolean {
  // Variables come back as strings from Bland — NEVER use !! or === true
  return parseVar(variables, key) === 'true'
}

// ── Business hours check ────────────────────────────────────────────────────

function isEasternBusinessHours(): boolean {
  const now = new Date()
  const year = now.getUTCFullYear()
  const marchSecondSunday = new Date(Date.UTC(year, 2, 1))
  marchSecondSunday.setUTCDate(marchSecondSunday.getUTCDate() + ((7 - marchSecondSunday.getUTCDay()) % 7) + 7)
  const novFirstSunday = new Date(Date.UTC(year, 10, 1))
  novFirstSunday.setUTCDate(novFirstSunday.getUTCDate() + ((7 - novFirstSunday.getUTCDay()) % 7))

  const dstStart = new Date(marchSecondSunday.getTime() + 7 * 60 * 60 * 1000)
  const dstEnd = new Date(novFirstSunday.getTime() + 6 * 60 * 60 * 1000)

  const isDST = now >= dstStart && now < dstEnd
  const offsetHours = isDST ? 4 : 5
  const easternHour = (now.getUTCHours() - offsetHours + 24) % 24
  const easternDay = now.getUTCDay()

  // Mon-Fri 9am-6pm Eastern
  if (easternDay === 0 || easternDay === 6) return false
  return easternHour >= 9 && easternHour < 18
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1. Validate webhook signature
  const webhookSecret = Deno.env.get('BLAND_WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('[BLAND_WEBHOOK] BLAND_WEBHOOK_SECRET not configured')
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const isValid = await verifyBlandSignature(req, webhookSecret)
  if (!isValid) {
    console.error('[BLAND_WEBHOOK] Invalid signature — rejecting')
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const payload = await req.json()
    const {
      call_id,
      status: callStatus,
      concatenated_transcript,
      variables,
      call_length: durationSeconds,
      to: phoneNumber,
      from: fromNumber,
    } = payload

    if (!call_id) {
      console.error('[BLAND_WEBHOOK] Missing call_id in payload')
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Determine call type from variables or by checking if we have an outbound match
    const callTypeVar = parseVar(variables, 'call_type')

    // Try to match as outbound first
    const { data: outboundLead } = await supabase
      .from('leads')
      .select('id, phone, agency_id, bland_outbound_call_id, canopy_link_sent, bland_retry_count')
      .eq('bland_outbound_call_id', call_id)
      .single()

    if (outboundLead) {
      // ── OUTBOUND FLOW ──────────────────────────────────────────────────
      await handleOutbound(supabase, payload, outboundLead, variables)
    } else {
      // ── INBOUND FLOW ───────────────────────────────────────────────────
      await handleInbound(supabase, payload, variables, phoneNumber || fromNumber)
    }
  } catch (err) {
    console.error('[BLAND_WEBHOOK] Unexpected error:', err)
    try {
      await logAudit(supabase, 'BLAND_WEBHOOK_ERROR', null, {
        error: String(err),
        message: (err as Error).message,
      })
    } catch (_) {
      // swallow — we already logged to console
    }
  }

  // Always return 200 to Bland
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})

// ── Outbound handler ────────────────────────────────────────────────────────

async function handleOutbound(
  supabase: any,
  payload: any,
  lead: any,
  variables: Record<string, any> | null
) {
  const {
    call_id,
    status: callStatus,
    concatenated_transcript,
    call_length: durationSeconds,
  } = payload

  const qualified = parseBoolVar(variables, 'qualified')
  const transferred = parseBoolVar(variables, 'transferred')
  const callbackRequested = parseBoolVar(variables, 'callback_requested')
  const canopyAccepted = parseBoolVar(variables, 'canopy_accepted')
  const disqualifyReason = parseVar(variables, 'disqualify_reason')
  const transferAttempted = parseBoolVar(variables, 'transfer_attempted')

  // Determine lead status based on outcome
  let newLeadStatus = lead.status
  if (transferred) {
    newLeadStatus = 'contacted'
  } else if (qualified) {
    newLeadStatus = 'qualified'
  } else if (disqualifyReason) {
    newLeadStatus = 'disqualified'
  }

  // Update lead record
  const now = new Date().toISOString()
  const leadUpdate: Record<string, any> = {
    bland_outbound_status: callStatus || 'completed',
    bland_verified: true,
    bland_qualified: qualified,
    bland_disqualify_reason: disqualifyReason,
    bland_call_transcript: concatenated_transcript || null,
    bland_verified_at: now,
    bland_canopy_offered: parseBoolVar(variables, 'canopy_offered') || canopyAccepted,
    bland_canopy_accepted: canopyAccepted,
    status: newLeadStatus,
  }
  if (qualified) {
    leadUpdate.bland_qualified_at = now
  }

  try {
    await supabase
      .from('leads')
      .update(leadUpdate)
      .eq('id', lead.id)
  } catch (err) {
    console.error('[BLAND_WEBHOOK] Lead update failed:', err)
    await logAudit(supabase, 'BLAND_WEBHOOK_ERROR', lead.id, {
      step: 'lead_update',
      error: String(err),
    })
  }

  // No-answer retry logic (Gap 4)
  const isNoAnswer = callStatus === 'no-answer' || callStatus === 'no_answer'
  if (isNoAnswer) {
    const retryCount = lead.bland_retry_count ?? 0
    const is_business_hours = isEasternBusinessHours()

    if (retryCount < 1 && is_business_hours) {
      // Schedule one retry at T+15min
      const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
      await supabase
        .from('leads')
        .update({
          bland_retry_count: retryCount + 1,
          bland_retry_at: retryAt,
        })
        .eq('id', lead.id)

      await logAudit(supabase, 'BLAND_RETRY_SCHEDULED', lead.id, {
        retry_at: retryAt,
        retry_count: retryCount + 1,
      })
    } else {
      // Max retries or after hours — hand off to drip immediately
      await supabase
        .from('leads')
        .update({
          bland_outbound_status: 'no-answer-final',
          drip_stage: 0,
          drip_scenario: 'never_reached',
        })
        .eq('id', lead.id)

      await logAudit(supabase, 'BLAND_HANDOFF_TO_DRIP', lead.id, {
        retry_count: retryCount,
        reason: retryCount >= 1 ? 'max_retries' : 'after_hours',
      })

      // Trigger SCENARIO A drip immediately — don't wait for next cron run
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      fetch(`${supabaseUrl}/functions/v1/lead-sms-drip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ lead_id: lead.id, force_scenario: 'never_reached' }),
      }).catch(err => console.error('[BLAND_WEBHOOK] Drip trigger failed:', err))
    }
  }

  // Write to bland_call_logs
  try {
    await supabase.from('bland_call_logs').upsert(
      {
        lead_id: lead.id,
        call_id,
        call_type: 'outbound_verification',
        direction: 'outbound',
        phone_number: lead.phone,
        status: callStatus,
        duration_seconds: durationSeconds ?? null,
        qualified,
        disqualify_reason: disqualifyReason,
        canopy_offered: parseBoolVar(variables, 'canopy_offered') || canopyAccepted,
        canopy_accepted: canopyAccepted,
        transferred,
        transferred_to_name: parseVar(variables, 'transferred_to_name'),
        transcript: concatenated_transcript || null,
        variables: variables || null,
        raw_payload: payload,
        updated_at: now,
      },
      { onConflict: 'call_id' }
    )
  } catch (err) {
    console.error('[BLAND_WEBHOOK] Call log insert failed:', err)
    await logAudit(supabase, 'BLAND_WEBHOOK_ERROR', lead.id, {
      step: 'call_log_insert',
      error: String(err),
    })
  }

  // Transfer outcome resolution (Gap 7)
  if (transferred) {
    const transferredToPhone = parseVar(variables, 'transfer_number_used')
    let transferredToName = parseVar(variables, 'transferred_to_name')
    let transferOutcome: 'connected' | 'no-answer' | 'failed' | null = null

    // Resolve outcome from Bland variables if available
    const transferConnected = parseBoolVar(variables, 'transfer_connected')
    if (transferConnected) {
      transferOutcome = 'connected'
    } else if (transferredToPhone) {
      transferOutcome = 'no-answer'
    }

    // If Bland didn't return the name, look it up from agent_availability
    if (!transferredToName && transferredToPhone) {
      const { data: agent } = await supabase
        .from('agent_availability')
        .select('user_id, profiles(full_name)')
        .eq('transfer_phone', transferredToPhone)
        .eq('agency_id', lead.agency_id)
        .maybeSingle()
      transferredToName = (agent?.profiles as any)?.full_name ?? null
    }

    if (transferredToPhone || transferOutcome) {
      await supabase
        .from('bland_call_logs')
        .update({
          transferred_to_phone: transferredToPhone,
          transferred_to_name: transferredToName,
          transfer_outcome: transferOutcome,
        })
        .eq('call_id', call_id)
    }
  }

  // Audit events
  if (qualified) {
    await logAudit(supabase, 'LEAD_QUALIFIED_BLAND', lead.id, {
      call_id,
      coverage_interest: parseVar(variables, 'coverage_interest'),
    })
  } else if (disqualifyReason) {
    await logAudit(supabase, 'LEAD_DISQUALIFIED_BLAND', lead.id, {
      call_id,
      reason: disqualifyReason,
    })
  }

  if (transferred) {
    await logAudit(supabase, 'BLAND_OUTBOUND_TRANSFERRED', lead.id, {
      call_id,
      transferred_to: parseVar(variables, 'transferred_to_name'),
    })
  } else if (transferAttempted) {
    await logAudit(supabase, 'BLAND_TRANSFER_MISSED', lead.id, {
      call_id,
    })
  }

  if (callbackRequested) {
    await logAudit(supabase, 'BLAND_CALLBACK_REQUESTED', lead.id, {
      call_id,
      callback_time: parseVar(variables, 'callback_time_preference'),
    })
  }

  // Send Canopy link if qualified + accepted
  if (qualified && canopyAccepted && !lead.canopy_link_sent && lead.phone) {
    try {
      await sendCanopyLink({
        lead_id: lead.id,
        phone_number: lead.phone,
        supabase,
      })
    } catch (err) {
      console.error('[BLAND_WEBHOOK] Canopy link send failed:', err)
    }
  }
}

// ── Inbound handler ─────────────────────────────────────────────────────────

async function handleInbound(
  supabase: any,
  payload: any,
  variables: Record<string, any> | null,
  rawPhone: string | null
) {
  const {
    call_id,
    status: callStatus,
    concatenated_transcript,
    call_length: durationSeconds,
  } = payload

  const callTypeVar = parseVar(variables, 'call_type')

  // Existing customer — log only, do NOT create lead
  if (callTypeVar === 'existing_customer') {
    try {
      await supabase.from('bland_call_logs').upsert(
        {
          call_id,
          call_type: 'inbound',
          direction: 'inbound',
          phone_number: rawPhone,
          status: callStatus,
          duration_seconds: durationSeconds ?? null,
          transcript: concatenated_transcript || null,
          variables: variables || null,
          raw_payload: payload,
        },
        { onConflict: 'call_id' }
      )
    } catch (err) {
      console.error('[BLAND_WEBHOOK] Existing customer call log failed:', err)
    }

    await logAudit(supabase, 'BLAND_INBOUND_EXISTING_CUSTOMER', null, {
      call_id,
      phone: rawPhone,
    })
    return
  }

  // New lead or unspecified — proceed with lead creation/update
  const normalizedPhone = rawPhone ? normalizePhoneForStorage(rawPhone) : null
  const qualified = parseBoolVar(variables, 'qualified')
  const transferred = parseBoolVar(variables, 'transferred')
  const canopyAccepted = parseBoolVar(variables, 'canopy_accepted')
  const callbackRequested = parseBoolVar(variables, 'callback_requested')
  const disqualifyReason = parseVar(variables, 'disqualify_reason')

  // Extract captured data from variables
  const verifiedName = parseVar(variables, 'verified_name')
  const verifiedAddress = parseVar(variables, 'verified_address')
  const vehicleCount = variables?.vehicle_count
    ? parseInt(String(variables.vehicle_count), 10) || null
    : null
  const ownsHome = parseBoolVar(variables, 'owns_home')

  // Determine capture completeness
  const hasName = !!verifiedName
  const hasZip = !!(verifiedAddress && verifiedAddress.length >= 5)
  const hasAsset = (vehicleCount != null && vehicleCount > 0) || ownsHome
  const fullCapture = hasName && hasZip && hasAsset

  // Check for existing lead by phone (last 30 days) — dedup guard
  let existingLead = null
  if (normalizedPhone) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data } = await supabase
      .from('leads')
      .select('id, phone, agency_id, canopy_link_sent')
      .eq('phone', normalizedPhone)
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    existingLead = data
  }

  // Get default agency
  const { data: defaultAgency } = await supabase
    .from('agencies')
    .select('id')
    .eq('is_default', true)
    .single()

  const agencyId = existingLead?.agency_id || defaultAgency?.id

  let leadId: string

  if (existingLead) {
    // Update existing lead with inbound call data
    leadId = existingLead.id
    const updateData: Record<string, any> = {
      bland_inbound_call_id: call_id,
      bland_call_transcript: concatenated_transcript || null,
      bland_verified: true,
      bland_verified_at: new Date().toISOString(),
      bland_qualified: qualified,
      bland_disqualify_reason: disqualifyReason,
      bland_canopy_offered: parseBoolVar(variables, 'canopy_offered') || canopyAccepted,
      bland_canopy_accepted: canopyAccepted,
    }
    if (qualified) {
      updateData.bland_qualified_at = new Date().toISOString()
    }

    try {
      await supabase.from('leads').update(updateData).eq('id', leadId)
    } catch (err) {
      console.error('[BLAND_WEBHOOK] Existing lead update failed:', err)
      await logAudit(supabase, 'BLAND_WEBHOOK_ERROR', leadId, {
        step: 'inbound_lead_update',
        error: String(err),
      })
    }
  } else {
    // Create new lead
    // Parse name parts
    const nameParts = verifiedName ? verifiedName.split(' ') : []
    const firstName = nameParts[0] || null
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null

    const leadData: Record<string, any> = {
      agency_id: agencyId,
      phone: normalizedPhone,
      first_name: firstName,
      last_name: lastName,
      state: parseVar(variables, 'verified_state') || 'GA',
      zip: parseVar(variables, 'verified_zip') || '00000',
      source: fullCapture ? 'inbound_call' : 'inbound_call_partial',
      status: fullCapture ? (qualified ? 'qualified' : 'new') : 'partial',
      product_intent: parseVar(variables, 'coverage_interest'),
      vehicle_count: vehicleCount,
      owns_home: ownsHome,
      bland_inbound_call_id: call_id,
      bland_call_transcript: concatenated_transcript || null,
      bland_verified: true,
      bland_verified_at: new Date().toISOString(),
      bland_qualified: qualified,
      bland_qualified_at: qualified ? new Date().toISOString() : null,
      bland_disqualify_reason: disqualifyReason,
      bland_canopy_offered: parseBoolVar(variables, 'canopy_offered') || canopyAccepted,
      bland_canopy_accepted: canopyAccepted,
      bland_partial_capture: !fullCapture,
      referred_by_name: parseVar(variables, 'referred_by_name'),
      referred_by_phone: parseVar(variables, 'referred_by_phone'),
    }

    try {
      const { data: newLead, error: insertErr } = await supabase
        .from('leads')
        .insert(leadData)
        .select('id')
        .single()

      if (insertErr) throw insertErr
      leadId = newLead.id
    } catch (err) {
      console.error('[BLAND_WEBHOOK] Inbound lead creation failed:', err)
      await logAudit(supabase, 'BLAND_WEBHOOK_ERROR', null, {
        step: 'inbound_lead_create',
        error: String(err),
        phone: normalizedPhone,
      })
      // Still write call log without lead_id
      leadId = ''
    }

    if (leadId) {
      await logAudit(supabase, 'LEAD_CREATED', leadId, {
        source: fullCapture ? 'inbound_call' : 'inbound_call_partial',
        full_capture: fullCapture,
      })
    }
  }

  // Write to bland_call_logs
  try {
    await supabase.from('bland_call_logs').upsert(
      {
        lead_id: leadId || null,
        call_id,
        call_type: 'inbound',
        direction: 'inbound',
        phone_number: normalizedPhone || rawPhone,
        status: callStatus,
        duration_seconds: durationSeconds ?? null,
        qualified,
        disqualify_reason: disqualifyReason,
        canopy_offered: parseBoolVar(variables, 'canopy_offered') || canopyAccepted,
        canopy_accepted: canopyAccepted,
        transferred,
        transferred_to_name: parseVar(variables, 'transferred_to_name'),
        transcript: concatenated_transcript || null,
        variables: variables || null,
        raw_payload: payload,
      },
      { onConflict: 'call_id' }
    )
  } catch (err) {
    console.error('[BLAND_WEBHOOK] Inbound call log insert failed:', err)
  }

  // Audit events
  if (transferred && leadId) {
    await logAudit(supabase, 'BLAND_INBOUND_TRANSFERRED', leadId, {
      call_id,
      transferred_to: parseVar(variables, 'transferred_to_name'),
    })
  }

  if (callbackRequested && leadId) {
    await logAudit(supabase, 'BLAND_CALLBACK_REQUESTED', leadId, {
      call_id,
      callback_time: parseVar(variables, 'callback_time_preference'),
    })
  }

  if (qualified && leadId) {
    await logAudit(supabase, 'LEAD_QUALIFIED_BLAND', leadId, {
      call_id,
      source: 'inbound',
    })
  } else if (disqualifyReason && leadId) {
    await logAudit(supabase, 'LEAD_DISQUALIFIED_BLAND', leadId, {
      call_id,
      reason: disqualifyReason,
      source: 'inbound',
    })
  }

  // Send Canopy link if full capture + qualified + accepted
  if (
    fullCapture &&
    qualified &&
    canopyAccepted &&
    leadId &&
    normalizedPhone &&
    !existingLead?.canopy_link_sent
  ) {
    try {
      await sendCanopyLink({
        lead_id: leadId,
        phone_number: normalizedPhone,
        supabase,
      })
    } catch (err) {
      console.error('[BLAND_WEBHOOK] Canopy link send failed (inbound):', err)
    }
  }
}
