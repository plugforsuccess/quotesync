// Supabase Edge Function: create-lead
// POST /functions/v1/create-lead
// Creates a lead record from Canopy completion or funnel form, routes to agency, notifies, logs audit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from '../_shared/cors.ts'

// F-05 fix: Sanitize UTM values (truncate + strip HTML)
function sanitizeUtm(val: string | null | undefined): string | null {
  if (!val) return null
  return val.slice(0, 256).replace(/<[^>]*>/g, '')
}

function computeRiskFlag(
  autoDrivingRecord: string | null,
  homeClaimsHistory: string | null
): 'green' | 'yellow' | 'red' {
  // Red: exceeds carrier limits
  if (autoDrivingRecord === '3+') return 'red'    // At carrier per-driver incident max
  if (homeClaimsHistory === '2+') return 'red'     // Exceeds carrier 1-claim limit

  // Yellow: has some history but within limits
  if (autoDrivingRecord === '1-2') return 'yellow'

  // Green: clean record or no data provided
  return 'green'
}

// Rate limiting: simple in-memory store (resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10 // requests per minute
const RATE_WINDOW = 60000 // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

// Deterministic hash for tie-breaking
function deterministicHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

interface RoutingRule {
  id: string
  agency_id: string
  state: string
  zip_prefix: string | null
  exclusivity_level: 'none' | 'zip' | 'state'
  priority_tier: number
  capacity_enabled: boolean
}

interface RouteResult {
  agencyId: string
  routingRuleId: string | null
  viaFallback: boolean
}

function routeLead(
  rules: RoutingRule[],
  state: string,
  zip: string,
  pullId: string,
  defaultAgencyId: string
): RouteResult {
  // Filter matching rules
  const matching = rules
    .filter(r => {
      if (!r.capacity_enabled) return false
      if (r.state !== state) return false
      if (r.zip_prefix && !zip.startsWith(r.zip_prefix)) return false
      return true
    })
    .sort((a, b) => {
      const exclOrder: Record<string, number> = { state: 3, zip: 2, none: 1 }
      const aExcl = exclOrder[a.exclusivity_level] || 0
      const bExcl = exclOrder[b.exclusivity_level] || 0
      if (bExcl !== aExcl) return bExcl - aExcl
      if (b.priority_tier !== a.priority_tier) return b.priority_tier - a.priority_tier
      return (b.zip_prefix?.length || 0) - (a.zip_prefix?.length || 0)
    })

  if (matching.length === 0) {
    return { agencyId: defaultAgencyId, routingRuleId: null, viaFallback: true }
  }

  // Exclusive match first
  const exclusive = matching.filter(r => r.exclusivity_level !== 'none')
  if (exclusive.length > 0) {
    return { agencyId: exclusive[0].agency_id, routingRuleId: exclusive[0].id, viaFallback: false }
  }

  // Top tier with deterministic tie-breaker
  const topTier = matching[0].priority_tier
  const topRules = matching.filter(r => r.priority_tier === topTier)

  if (topRules.length === 1) {
    return { agencyId: topRules[0].agency_id, routingRuleId: topRules[0].id, viaFallback: false }
  }

  const hash = deterministicHash(pullId)
  const winner = topRules[hash % topRules.length]
  return { agencyId: winner.agency_id, routingRuleId: winner.id, viaFallback: false }
}

Deno.serve(async (req) => {
  // Resolve CORS headers once per request (matches Origin against allowlist)
  const corsHeaders = getCorsHeaders(req)

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  // Rate limit check
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
  if (!checkRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  try {
    const body = await req.json()

    // Validate required fields
    const { pull_id, state, zip, session_id } = body
    const isFunnelLead = body.source === 'funnel'

    // pull_id is required for Canopy leads, optional for funnel leads
    if (!isFunnelLead && !pull_id) throw new Error('pull_id is required')
    if (!state || state.length !== 2) throw new Error('state must be 2-letter code')
    if (!zip || !/^\d{5}/.test(zip)) throw new Error('zip must be valid 5-digit code')

    const sessionId = session_id || crypto.randomUUID()

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // F-02 fix: Deduplication — check pull_id (Canopy) or session_id (funnel)
    if (pull_id) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('pull_id', pull_id)
        .single()

      if (existingLead) {
        return new Response(JSON.stringify({
          error: 'Lead already exists',
          lead_id: existingLead.id
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    // For funnel leads: check if a partial lead with this session_id exists
    // If so, update it instead of creating a duplicate
    let existingPartialLead = null
    if (isFunnelLead && sessionId) {
      const { data: partialLead } = await supabase
        .from('leads')
        .select('id')
        .eq('session_id', sessionId)
        .eq('status', 'partial')
        .eq('source', 'funnel')
        .single()

      existingPartialLead = partialLead
    }

    // Get default agency
    const { data: defaultAgency } = await supabase
      .from('agencies')
      .select('id')
      .eq('is_default', true)
      .single()

    const defaultAgencyId = defaultAgency?.id

    if (!defaultAgencyId) {
      throw new Error('No default agency configured')
    }

    // Get all active routing rules
    const { data: routingRules } = await supabase
      .from('routing_rules')
      .select('*')
      .eq('capacity_enabled', true)

    // Route the lead
    const routing = routeLead(
      routingRules || [],
      state.toUpperCase(),
      zip,
      pull_id || sessionId,
      defaultAgencyId
    )

    // Normalize phone to 10-digit canonical format for consistent lookups
    const normalizedPhone = body.phone
      ? body.phone.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
      : null
    const isValidPhone = normalizedPhone && normalizedPhone.length === 10

    // F-05 fix: Sanitize UTM values
    const sanitizedUtm = {
      utm_source: sanitizeUtm(body.utm_source),
      utm_medium: sanitizeUtm(body.utm_medium),
      utm_campaign: sanitizeUtm(body.utm_campaign),
      utm_content: sanitizeUtm(body.utm_content),
      utm_term: sanitizeUtm(body.utm_term),
    }

    // F-04 fix: Capture consent_ip server-side from request header (client can't reliably self-report)
    const consentIp = clientIp !== 'unknown' ? clientIp : null

    let lead: any

    if (existingPartialLead) {
      // F-02 fix: Update existing partial lead instead of creating a duplicate
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          agency_id: routing.agencyId,
          ...sanitizedUtm,
          referral_code: body.referral_code || null,
          landing_page: body.landing_page || null,
          routing_rule_id: routing.routingRuleId,
          routed_via_fallback: routing.viaFallback,
          status: 'new',
          first_name: body.first_name || null,
          last_name: body.last_name || null,
          phone: isValidPhone ? normalizedPhone : null,
          email: body.email || null,
          product_intent: body.product_intent ?? null,
          owns_home: body.owns_home ?? null,
          vehicle_count: body.vehicle_count ?? null,
          lead_score: body.lead_score || null,
          // F-04: TCPA consent fields (consent_ip captured server-side)
          consent_given_at: body.consent_given_at || null,
          consent_ip: consentIp,
          consent_version: body.consent_version || null,
          consent_user_agent: body.consent_user_agent || null,
          auto_driving_record: body.auto_driving_record || null,
          home_claims_history: body.home_claims_history || null,
          risk_flag: computeRiskFlag(body.auto_driving_record, body.home_claims_history),
        })
        .eq('id', existingPartialLead.id)
        .select()
        .single()

      if (updateError) throw updateError
      lead = updatedLead
    } else {
      // Create new lead record (Canopy flow or funnel without partial)
      const leadData = {
        pull_id: pull_id || null,
        agency_id: routing.agencyId,
        state: state.toUpperCase(),
        zip,
        product_intent: body.product_intent || null,
        session_id: sessionId,
        ...sanitizedUtm,
        referral_code: body.referral_code || null,
        landing_page: body.landing_page || null,
        routing_rule_id: routing.routingRuleId,
        routed_via_fallback: routing.viaFallback,
        status: 'new',
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        phone: isValidPhone ? normalizedPhone : null,
        email: body.email || null,
        owns_home: body.owns_home || null,
        vehicle_count: body.vehicle_count || null,
        source: body.source || 'canopy',
        lead_score: body.lead_score || null,
        // F-04: TCPA consent fields (consent_ip captured server-side)
        consent_given_at: body.consent_given_at || null,
        consent_ip: consentIp,
        consent_version: body.consent_version || null,
        consent_user_agent: body.consent_user_agent || null,
        auto_driving_record: body.auto_driving_record || null,
        home_claims_history: body.home_claims_history || null,
        risk_flag: computeRiskFlag(body.auto_driving_record, body.home_claims_history),
      }

      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert(leadData)
        .select()
        .single()

      if (leadError) throw leadError
      lead = newLead
    }

    // Audit: LEAD_CREATED (or LEAD_ACTIVATED for funnel upgrades)
    await supabase.from('audit_log').insert({
      event_type: existingPartialLead ? 'LEAD_ACTIVATED' : 'LEAD_CREATED',
      lead_id: lead.id,
      agency_id: routing.agencyId,
      metadata: {
        pull_id: pull_id || null,
        source: body.source || 'canopy',
        state: state.toUpperCase(),
        zip,
        has_utm: !!(body.utm_source || body.utm_medium || body.utm_campaign),
        has_referral: !!body.referral_code
      }
    })

    // Audit: ROUTED (or ROUTING_FALLBACK)
    await supabase.from('audit_log').insert({
      event_type: routing.viaFallback ? 'ROUTING_FALLBACK' : 'ROUTED',
      lead_id: lead.id,
      agency_id: routing.agencyId,
      metadata: {
        routing_rule_id: routing.routingRuleId,
        state: state.toUpperCase(),
        zip
      }
    })

    // Get agency users to notify (owner, manager only)
    const { data: agencyUsers } = await supabase
      .from('agency_users')
      .select('user_id, role')
      .eq('agency_id', routing.agencyId)
      .in('role', ['owner', 'manager'])
      .eq('receives_notifications', true)

    // Create in-app notifications
    if (agencyUsers && agencyUsers.length > 0) {
      const notifications = agencyUsers.map(u => ({
        user_id: u.user_id,
        type: 'NEW_LEAD',
        title: 'New Lead Received',
        message: `A new lead from ${state.toUpperCase()} (${zip}) has been assigned to your agency.`,
        metadata: { lead_id: lead.id }
      }))

      await supabase.from('notifications').insert(notifications)

      // Audit: NOTIFIED
      await supabase.from('audit_log').insert({
        event_type: 'NOTIFIED',
        lead_id: lead.id,
        agency_id: routing.agencyId,
        metadata: {
          notified_users: agencyUsers.length,
          notification_type: 'in_app'
        }
      })
    }

    // Get agency email for external notification (email sending would go here)
    const { data: agency } = await supabase
      .from('agencies')
      .select('email, name')
      .eq('id', routing.agencyId)
      .single()

    // TODO: Send email notification to agency.email
    // For now, log to console (visible in Supabase logs)
    console.log(`[LEAD NOTIFICATION] New lead ${lead.id} for agency ${agency?.name} (${agency?.email})`)

    // Trigger SMS + speed-to-call automation (fire-and-forget)
    // Only if lead has a valid phone number (will be null for Canopy-only leads until enrichment)
    if (isValidPhone) {
      const notifyUrl = `${supabaseUrl}/functions/v1/lead-notify-sms`
      fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          lead_id: lead.id,
          first_name: body.first_name || 'there',
          phone: normalizedPhone,
          zip: zip,
          owns_home: body.owns_home || false,
          vehicle_count: body.vehicle_count || 1,
        }),
      }).catch(smsError => {
        // Don't fail lead creation if SMS fails
        console.error('[CREATE_LEAD] SMS automation fire-and-forget error:', smsError.message)
      })
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id: lead.id,
      agency_id: routing.agencyId,
      routed_via_fallback: routing.viaFallback
    }), {
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Lead creation error:', error)
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
