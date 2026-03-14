// Supabase Edge Function: enrich-lead
// Processes enrichment jobs from the queue
// Can be triggered by cron or invoked directly with job_id

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { normalizeToQuoteSummary } from '../_shared/canopyClient.ts'

const MAX_ATTEMPTS = 3

// Inlined lead scoring (ported from src/lib/leadScoring.js)
interface ScoreFactor {
  label: string
  points: number
}

function computeLeadScore(
  lead: { zip?: string | null; state?: string | null; utm_source?: string | null; utm_campaign?: string | null; referral_code?: string | null },
  quoteSummary: Record<string, unknown> | null = null
): { score: number; factors: ScoreFactor[] } {
  const factors: ScoreFactor[] = []
  let score = 0

  // 1. Location completeness (max 10)
  if (lead.zip && lead.state) {
    factors.push({ label: 'Location complete', points: 10 })
    score += 10
  } else if (lead.zip || lead.state) {
    factors.push({ label: 'Partial location', points: 5 })
    score += 5
  }

  // 2. Enrichment available (max 15)
  if (quoteSummary && Object.keys(quoteSummary).length > 0) {
    factors.push({ label: 'Enrichment data', points: 15 })
    score += 15
  }

  // 3. Bundle potential (max 20)
  const policyTypes = (quoteSummary?.policy_types as string[]) || []
  if (policyTypes.length >= 3) {
    factors.push({ label: 'Multi-policy bundle', points: 20 })
    score += 20
  } else if (policyTypes.length === 2) {
    factors.push({ label: 'Two policies', points: 15 })
    score += 15
  } else if (policyTypes.length === 1) {
    factors.push({ label: 'Single policy', points: 5 })
    score += 5
  }

  // 4. Size proxy (max 15)
  const vehicleCount = (quoteSummary?.vehicle_count as number) || 0
  const driverCount = (quoteSummary?.driver_count as number) || 0
  const propertyCount = (quoteSummary?.property_count as number) || 0
  const totalAssets = vehicleCount + driverCount + propertyCount
  if (totalAssets >= 4) {
    factors.push({ label: `${totalAssets} assets`, points: 15 })
    score += 15
  } else if (totalAssets >= 2) {
    factors.push({ label: `${totalAssets} assets`, points: 10 })
    score += 10
  } else if (totalAssets >= 1) {
    factors.push({ label: `${totalAssets} asset`, points: 5 })
    score += 5
  }

  // 5. Renewal proximity (max 15)
  const renewalDays = (quoteSummary?.renewal_days as number) ?? null
  if (renewalDays !== null) {
    if (renewalDays <= 14) {
      factors.push({ label: 'Renewal < 2 weeks', points: 15 })
      score += 15
    } else if (renewalDays <= 30) {
      factors.push({ label: 'Renewal < 30 days', points: 12 })
      score += 12
    } else if (renewalDays <= 60) {
      factors.push({ label: 'Renewal < 60 days', points: 8 })
      score += 8
    }
  }

  // 6. Documents available (max 10)
  const hasDocuments = (quoteSummary?.has_documents as boolean) || false
  const documentCount = (quoteSummary?.document_count as number) || 0
  if (hasDocuments && documentCount > 0) {
    factors.push({ label: `${documentCount} doc(s) available`, points: 10 })
    score += 10
  }

  // 7. Attribution quality (max 15)
  if (lead.referral_code) {
    factors.push({ label: 'Referral', points: 15 })
    score += 15
  } else if (lead.utm_campaign) {
    factors.push({ label: 'Campaign tracked', points: 8 })
    score += 8
  } else if (lead.utm_source) {
    factors.push({ label: 'Source tracked', points: 5 })
    score += 5
  }

  score = Math.min(score, 100)
  return { score, factors }
}

interface EnrichmentJob {
  id: string
  lead_id: string
  pull_id: string
  event_type: string
  payload: Record<string, unknown> | null
  status: string
  attempts: number
}

async function processJob(
  supabase: ReturnType<typeof createClient>,
  job: EnrichmentJob
): Promise<{ success: boolean; error?: string }> {
  const { id: jobId, lead_id: leadId, pull_id: pullId, event_type: eventType, payload } = job

  // Get lead with agency_id and score-relevant columns
  const { data: lead } = await supabase
    .from('leads')
    .select('id, agency_id, zip, state, utm_source, utm_campaign, referral_code')
    .eq('id', leadId)
    .single()

  if (!lead) {
    return { success: false, error: 'Lead not found' }
  }

  // Audit: ENRICHMENT_STARTED
  await supabase.from('audit_log').insert({
    event_type: 'ENRICHMENT_STARTED',
    lead_id: leadId,
    agency_id: lead.agency_id,
    metadata: { job_id: jobId, pull_id: pullId, event_type: eventType },
  })

  try {
    if (!payload) {
      throw new Error('No payload data stored for this job')
    }

    // Determine if documents are available based on event type
    const documents = (payload.documents as unknown[]) || []
    const hasDocuments = eventType === 'COMPLETE' && documents.length > 0

    // Normalize payload to quote summary
    const quoteSummary = normalizeToQuoteSummary(payload, hasDocuments)

    // Upsert lead_quotes (one row per lead)
    const { error: upsertError } = await supabase
      .from('lead_quotes')
      .upsert(
        {
          lead_id: leadId,
          agency_id: lead.agency_id,
          quote_summary: quoteSummary,
          enrichment_status: 'enriched',
          has_documents: hasDocuments,
          enriched_at: new Date().toISOString(),
        },
        { onConflict: 'lead_id' }
      )

    if (upsertError) throw upsertError

    // Compute and persist lead score
    const { score, factors } = computeLeadScore(
      { zip: lead.zip, state: lead.state, utm_source: lead.utm_source,
        utm_campaign: lead.utm_campaign, referral_code: lead.referral_code },
      { ...quoteSummary, has_documents: hasDocuments }
    )

    // Update leads table with enrichment status + score in a single round-trip
    await supabase
      .from('leads')
      .update({
        enrichment_status: 'enriched',
        quote_updated_at: new Date().toISOString(),
        lead_score: score,
        score_factors: factors,
        score_updated_at: new Date().toISOString(),
      })
      .eq('id', leadId)

    // Mark job completed
    await supabase
      .from('enrichment_jobs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    // Audit: ENRICHMENT_SUCCEEDED
    await supabase.from('audit_log').insert({
      event_type: 'ENRICHMENT_SUCCEEDED',
      lead_id: leadId,
      agency_id: lead.agency_id,
      metadata: {
        job_id: jobId,
        pull_id: pullId,
        has_documents: hasDocuments,
        policy_types: quoteSummary.policy_types,
        lead_score: score,
      },
    })

    return { success: true }

  } catch (error) {
    const errorMessage = error.message || 'Unknown error'

    // Update job with error
    const newAttempts = job.attempts + 1
    const newStatus = newAttempts >= MAX_ATTEMPTS ? 'failed' : 'pending'

    await supabase
      .from('enrichment_jobs')
      .update({
        status: newStatus,
        attempts: newAttempts,
        last_error: errorMessage,
        started_at: null, // Reset for retry
      })
      .eq('id', jobId)

    // If failed permanently, update lead and audit
    if (newStatus === 'failed') {
      await supabase
        .from('leads')
        .update({ enrichment_status: 'failed' })
        .eq('id', leadId)

      // Upsert failed status to lead_quotes
      await supabase
        .from('lead_quotes')
        .upsert(
          {
            lead_id: leadId,
            agency_id: lead.agency_id,
            enrichment_status: 'failed',
          },
          { onConflict: 'lead_id' }
        )

      await supabase.from('audit_log').insert({
        event_type: 'ENRICHMENT_FAILED',
        lead_id: leadId,
        agency_id: lead.agency_id,
        metadata: {
          job_id: jobId,
          pull_id: pullId,
          error: errorMessage,
          attempts: newAttempts,
        },
      })
    }

    return { success: false, error: errorMessage }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    let jobsToProcess: EnrichmentJob[] = []

    // Check if specific job_id provided
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.job_id) {
        const { data: job } = await supabase
          .from('enrichment_jobs')
          .select('*')
          .eq('id', body.job_id)
          .single()

        if (job) {
          jobsToProcess = [job]
        }
      }
    }

    // Otherwise, pick pending jobs from queue
    if (jobsToProcess.length === 0) {
      const { data: pendingJobs } = await supabase
        .from('enrichment_jobs')
        .select('*')
        .eq('status', 'pending')
        .lt('attempts', MAX_ATTEMPTS)
        .order('created_at', { ascending: true })
        .limit(10)

      jobsToProcess = pendingJobs || []
    }

    if (jobsToProcess.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No jobs to process',
        processed: 0,
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Mark jobs as processing
    const jobIds = jobsToProcess.map(j => j.id)
    await supabase
      .from('enrichment_jobs')
      .update({ status: 'processing', started_at: new Date().toISOString() })
      .in('id', jobIds)

    // Process jobs
    const results = await Promise.allSettled(
      jobsToProcess.map(job => processJob(supabase, job))
    )

    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - succeeded

    console.log(`[ENRICH_LEAD] Processed ${results.length} jobs: ${succeeded} succeeded, ${failed} failed`)

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      succeeded,
      failed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[ENRICH_LEAD] Error:', error.message)
    return new Response(JSON.stringify({
      error: 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
