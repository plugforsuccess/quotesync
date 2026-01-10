// Supabase Edge Function: create-lead
// POST /functions/v1/create-lead
// Creates a lead record from Canopy completion, routes to agency, notifies, logs audit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    if (!pull_id) throw new Error('pull_id is required')
    if (!state || state.length !== 2) throw new Error('state must be 2-letter code')
    if (!zip || !/^\d{5}/.test(zip)) throw new Error('zip must be valid 5-digit code')

    const sessionId = session_id || crypto.randomUUID()

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check for duplicate pull_id
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
      pull_id,
      defaultAgencyId
    )

    // Create lead record with consent tracking
    const consentText = 'By continuing, you consent to be contacted about your insurance request. Your information is shared only with the agency assigned for your area and is not sold.'

    const leadData = {
      pull_id,
      agency_id: routing.agencyId,
      state: state.toUpperCase(),
      zip,
      product_intent: body.product_intent || null,
      session_id: sessionId,
      utm_source: body.utm_source || null,
      utm_medium: body.utm_medium || null,
      utm_campaign: body.utm_campaign || null,
      utm_content: body.utm_content || null,
      utm_term: body.utm_term || null,
      referral_code: body.referral_code || null,
      landing_page: body.landing_page || null,
      routing_rule_id: routing.routingRuleId,
      routed_via_fallback: routing.viaFallback,
      status: 'new',
      consent_at: new Date().toISOString(),
      consent_text: consentText
    }

    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single()

    if (leadError) throw leadError

    // Audit: LEAD_CREATED
    await supabase.from('audit_log').insert({
      event_type: 'LEAD_CREATED',
      lead_id: lead.id,
      agency_id: routing.agencyId,
      metadata: {
        pull_id,
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
