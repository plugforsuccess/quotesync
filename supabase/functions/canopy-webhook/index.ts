// Supabase Edge Function: canopy-webhook
// POST /functions/v1/canopy-webhook
// Receives Canopy webhooks and enqueues enrichment jobs

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Webhook event types we handle
const HANDLED_EVENTS = ['POLICIES_AVAILABLE', 'COMPLETE']

// Verify webhook signature using HMAC-SHA256
async function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const expectedSignature = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Constant-time comparison
  if (signature.length !== expectedSignature.length) return false
  let result = 0
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i)
  }
  return result === 0
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const startTime = Date.now()

  try {
    // Get raw body for signature verification
    const rawBody = await req.text()
    const body = JSON.parse(rawBody)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify webhook signature
    const webhookSecret = Deno.env.get('CANOPY_WEBHOOK_SECRET')
    const signature = req.headers.get('x-canopy-signature')

    if (webhookSecret) {
      const isValid = await verifyWebhookSignature(rawBody, signature, webhookSecret)
      if (!isValid) {
        console.error('[CANOPY_WEBHOOK] Invalid signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      // Fallback: check shared secret header if no HMAC secret configured
      const sharedSecret = Deno.env.get('CANOPY_SHARED_SECRET')
      const providedSecret = req.headers.get('x-webhook-secret')
      if (sharedSecret && providedSecret !== sharedSecret) {
        console.error('[CANOPY_WEBHOOK] Invalid shared secret')
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Extract event data (sanitize - don't log PII)
    const eventType = body.event || body.type || 'UNKNOWN'
    const pullId = body.pull_id || body.pullId || body.data?.pull_id

    if (!pullId) {
      console.error('[CANOPY_WEBHOOK] Missing pull_id in payload')
      return new Response(JSON.stringify({ error: 'Missing pull_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Audit: CANOPY_WEBHOOK_RECEIVED (no PII in metadata)
    await supabase.from('audit_log').insert({
      event_type: 'CANOPY_WEBHOOK_RECEIVED',
      metadata: {
        pull_id: pullId,
        event_type: eventType,
        handled: HANDLED_EVENTS.includes(eventType),
      },
    })

    // Skip unhandled events
    if (!HANDLED_EVENTS.includes(eventType)) {
      console.log(`[CANOPY_WEBHOOK] Ignoring event type: ${eventType}`)
      return new Response(JSON.stringify({
        success: true,
        message: 'Event ignored',
        event_type: eventType,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find existing lead by pull_id
    let { data: lead } = await supabase
      .from('leads')
      .select('id, agency_id')
      .eq('pull_id', pullId)
      .single()

    // If no lead found, create orphan lead in default agency
    if (!lead) {
      console.log(`[CANOPY_WEBHOOK] Orphan pull: ${pullId}, creating fallback lead`)

      // Get default agency
      const { data: defaultAgency } = await supabase
        .from('agencies')
        .select('id')
        .eq('is_default', true)
        .single()

      if (!defaultAgency) {
        // Try with known default ID
        const { data: fallbackAgency } = await supabase
          .from('agencies')
          .select('id')
          .limit(1)
          .single()

        if (!fallbackAgency) {
          throw new Error('No agency available for orphan lead')
        }
        defaultAgency.id = fallbackAgency.id
      }

      // Create minimal lead
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          pull_id: pullId,
          agency_id: defaultAgency.id,
          status: 'new',
          state: 'XX', // Unknown
          zip: '00000', // Unknown
        })
        .select('id, agency_id')
        .single()

      if (leadError) {
        // Handle race condition - lead may have been created
        if (leadError.code === '23505') {
          const { data: existingLead } = await supabase
            .from('leads')
            .select('id, agency_id')
            .eq('pull_id', pullId)
            .single()
          lead = existingLead
        } else {
          throw leadError
        }
      } else {
        lead = newLead
      }

      // Audit orphan
      await supabase.from('audit_log').insert({
        event_type: 'ENRICHMENT_ORPHAN_PULL',
        lead_id: lead?.id,
        agency_id: lead?.agency_id,
        metadata: { pull_id: pullId },
      })
    }

    if (!lead) {
      throw new Error('Failed to locate or create lead')
    }

    // Check for existing pending/processing job (idempotency)
    const { data: existingJob } = await supabase
      .from('enrichment_jobs')
      .select('id, status')
      .eq('pull_id', pullId)
      .eq('event_type', eventType)
      .in('status', ['pending', 'processing'])
      .single()

    if (existingJob) {
      console.log(`[CANOPY_WEBHOOK] Job already exists: ${existingJob.id}`)
      return new Response(JSON.stringify({
        success: true,
        message: 'Job already queued',
        job_id: existingJob.id,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Extract enrichment-relevant data from payload (exclude raw PII)
    // Store only policy/document structure needed for quote_summary
    const enrichmentPayload = {
      policies: body.policies || body.data?.policies || [],
      documents: body.documents || body.data?.documents || [],
      // Only store state/zip presence, not full consumer data
      consumer: {
        state: body.consumer?.state || body.data?.consumer?.state || null,
        zip: body.consumer?.zip || body.data?.consumer?.zip || null,
      },
    }

    // Enqueue enrichment job with payload
    const { data: job, error: jobError } = await supabase
      .from('enrichment_jobs')
      .insert({
        lead_id: lead.id,
        pull_id: pullId,
        event_type: eventType,
        payload: enrichmentPayload,
        status: 'pending',
      })
      .select('id')
      .single()

    if (jobError) throw jobError

    // Respond quickly (< 2s target)
    const duration = Date.now() - startTime
    console.log(`[CANOPY_WEBHOOK] Queued job ${job.id} for pull ${pullId} in ${duration}ms`)

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      lead_id: lead.id,
    }), {
      status: 202,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[CANOPY_WEBHOOK] Error:', error.message)
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
