// Supabase Edge Function: create-lead
// POST /functions/v1/create-lead
// Creates a lead record from Canopy completion or funnel form, routes to agency, notifies, logs audit

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// CORS — inline to avoid _shared bundling issues during deployment
const allowedOrigins = [
  'https://insuredbycam.com',
  'https://www.insuredbycam.com',
  'https://quotesync.vercel.app',
]
const envOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')
if (envOrigin && !allowedOrigins.includes(envOrigin)) {
  allowedOrigins.push(envOrigin)
}
// Multi-agency: additional origins via comma-separated env var
const extraOrigins = (Deno.env.get('CORS_EXTRA_ORIGINS') || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)
allowedOrigins.push(...extraOrigins)
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')
  const matched = isAllowed ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

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

// Rate limiting: DB-backed to survive Edge Function cold starts
const RATE_LIMIT = 10 // requests per minute
const RATE_WINDOW = 60_000 // 1 minute

async function checkRateLimit(supabase: any, ip: string): Promise<boolean> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + RATE_WINDOW)
  const key = `create_lead:${ip}`

  // Try to read existing entry
  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count, reset_at')
    .eq('key', key)
    .single()

  // If no entry or expired, upsert a fresh window
  if (!existing || new Date(existing.reset_at) <= now) {
    await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, reset_at: windowEnd.toISOString() }, { onConflict: 'key' })
    return true
  }

  // Active window — check limit
  if (existing.count >= RATE_LIMIT) return false

  // Increment counter
  await supabase
    .from('rate_limits')
    .update({ count: existing.count + 1 })
    .eq('key', key)

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
  // Quality routing fields
  min_score: number | null
  max_score: number | null
  carrier_filter: string | null
  rule_type: 'geographic' | 'quality' | 'combined'
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

// Pass 2: Quality-based routing (runs after lead score and carrier data are available)
function routeLeadByQuality(
  qualityRules: RoutingRule[],
  state: string,
  zip: string,
  leadScore: number | null,
  autoCarrier: string | null,
  homeCarrier: string | null,
  rentersCarrier: string | null,
  currentAgencyId: string
): RouteResult {
  if (!qualityRules || qualityRules.length === 0) {
    return { agencyId: currentAgencyId, routingRuleId: null, viaFallback: false }
  }

  const matching = qualityRules
    .filter(r => {
      if (!r.capacity_enabled) return false

      // Geographic conditions (for 'combined' type)
      if (r.rule_type === 'combined') {
        if (r.state && r.state !== state) return false
        if (r.zip_prefix && !zip.startsWith(r.zip_prefix)) return false
      }

      // Score conditions
      if (r.min_score != null && (leadScore == null || leadScore < r.min_score)) return false
      if (r.max_score != null && (leadScore == null || leadScore > r.max_score)) return false

      // Carrier filter
      if (r.carrier_filter) {
        const carrierMatch = autoCarrier === r.carrier_filter
          || homeCarrier === r.carrier_filter
          || rentersCarrier === r.carrier_filter
        if (!carrierMatch) return false
      }

      // Don't reroute to the same agency
      if (r.agency_id === currentAgencyId) return false

      return true
    })
    .sort((a, b) => b.priority_tier - a.priority_tier)

  if (matching.length === 0) {
    return { agencyId: currentAgencyId, routingRuleId: null, viaFallback: false }
  }

  return {
    agencyId: matching[0].agency_id,
    routingRuleId: matching[0].id,
    viaFallback: false
  }
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

  // Rate limit check (needs Supabase client — init early)
  const clientIp = req.headers.get('x-forwarded-for') || 'unknown'
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseKey)
  if (!(await checkRateLimit(supabase, clientIp))) {
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

    // Pass 1: Geographic routing (state + ZIP prefix)
    const geographicRules = (routingRules || []).filter(
      (r: RoutingRule) => !r.rule_type || r.rule_type === 'geographic'
    )
    const routing = routeLead(
      geographicRules,
      state.toUpperCase(),
      zip,
      pull_id || sessionId,
      defaultAgencyId
    )

    // Pass 2: Quality-based routing (carrier + score)
    // Only applies when we have carrier/score data (full submission, not partial)
    const hasQualityData = body.lead_score != null
      || body.current_auto_carrier != null
      || body.current_home_carrier != null
      || body.current_renters_carrier != null
    const qualityRules = (routingRules || []).filter(
      (r: RoutingRule) => r.rule_type === 'quality' || r.rule_type === 'combined'
    )

    let finalAgencyId = routing.agencyId
    let finalRoutingRuleId = routing.routingRuleId
    let finalViaFallback = routing.viaFallback

    if (hasQualityData && qualityRules.length > 0) {
      const qualityRouting = routeLeadByQuality(
        qualityRules,
        state.toUpperCase(),
        zip,
        body.lead_score ?? null,
        body.current_auto_carrier ?? null,
        body.current_home_carrier ?? null,
        body.current_renters_carrier ?? null,
        routing.agencyId
      )

      if (qualityRouting.agencyId !== routing.agencyId) {
        finalAgencyId = qualityRouting.agencyId
        finalRoutingRuleId = qualityRouting.routingRuleId
        finalViaFallback = false
        console.log(`[QUALITY_ROUTING] Lead rerouted from agency ${routing.agencyId} to ${finalAgencyId} via quality rule ${finalRoutingRuleId}`)
      }
    }

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

    // Landlord routing: if occupancy is rental, override product intent
    const effectiveProductIntent =
      body.home_occupancy_type === 'rental' ? 'landlord' : body.product_intent;

    let lead: any

    if (existingPartialLead) {
      // F-02 fix: Update existing partial lead instead of creating a duplicate
      const { data: updatedLead, error: updateError } = await supabase
        .from('leads')
        .update({
          agency_id: finalAgencyId,
          ...sanitizedUtm,
          referral_code: body.referral_code || null,
          landing_page: body.landing_page || null,
          routing_rule_id: finalRoutingRuleId,
          routed_via_fallback: finalViaFallback,
          status: 'new',
          first_name: body.first_name || null,
          last_name: body.last_name || null,
          phone: isValidPhone ? normalizedPhone : null,
          email: body.email || null,
          product_intent: effectiveProductIntent ?? null,
          owns_home: body.owns_home === true ? true : body.owns_home === false || body.owns_home === 'other' ? false : null,
          housing_situation: body.owns_home === true ? 'own' : body.owns_home === 'other' ? 'other' : body.owns_home === false ? 'rent' : null,
          vehicle_count: body.vehicle_count ?? null,
          lead_score: body.lead_score ?? null,
          // F-04: TCPA consent fields (consent_ip captured server-side)
          consent_given_at: body.consent_given_at || null,
          consent_ip: consentIp,
          consent_version: body.consent_version || null,
          consent_user_agent: body.consent_user_agent || null,
          auto_driving_record: body.auto_driving_record || null,
          home_claims_history: body.home_claims_history || null,
          risk_flag: computeRiskFlag(body.auto_driving_record, body.home_claims_history),
          // V2 wizard fields
          date_of_birth: body.date_of_birth || null,
          street_address: body.street_address || null,
          address_unit: body.address_unit || null,
          city: body.city || null,
          // V2.1 fields
          current_renters_carrier: body.current_renters_carrier || null,
          marital_status: body.marital_status || null,
          address_source: body.address_source || 'manual_entry',
          // Enrichment fields
          vehicle_year: body.vehicle_year ?? null,
          vehicle_make: body.vehicle_make ?? null,
          vehicle_model: body.vehicle_model ?? null,
          vehicle_use: body.vehicle_use ?? null,
          coverage_lapse: body.coverage_lapse ?? null,
          multiple_drivers: body.multiple_drivers ?? null,
          veteran_status: body.veteran_status ?? null,
          current_auto_premium: body.current_auto_premium != null
            ? parseInt(body.current_auto_premium, 10) || null
            : null,
          current_home_premium: body.current_home_premium != null
            ? parseInt(body.current_home_premium, 10) || null
            : null,
          // Home insurance wizard fields
          home_insurance_status: body.home_insurance_status ?? null,
          home_occupancy_type: body.home_occupancy_type ?? null,
          roof_replaced_recently: body.roof_replaced_recently ?? null,
          year_built: body.year_built ?? null,
          square_footage: body.square_footage ?? null,
          stories: body.stories ?? null,
          property_data_source: body.property_data_source ?? null,
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
        agency_id: finalAgencyId,
        state: state.toUpperCase(),
        zip,
        product_intent: effectiveProductIntent ?? null,
        session_id: sessionId,
        ...sanitizedUtm,
        referral_code: body.referral_code || null,
        landing_page: body.landing_page || null,
        routing_rule_id: finalRoutingRuleId,
        routed_via_fallback: finalViaFallback,
        status: 'new',
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        phone: isValidPhone ? normalizedPhone : null,
        email: body.email || null,
        owns_home: body.owns_home === true ? true : body.owns_home === false || body.owns_home === 'other' ? false : null,
        housing_situation: body.owns_home === true ? 'own' : body.owns_home === 'other' ? 'other' : body.owns_home === false ? 'rent' : null,
        vehicle_count: body.vehicle_count ?? null,
        source: body.source || 'canopy',
        lead_score: body.lead_score ?? null,
        // F-04: TCPA consent fields (consent_ip captured server-side)
        consent_given_at: body.consent_given_at || null,
        consent_ip: consentIp,
        consent_version: body.consent_version || null,
        consent_user_agent: body.consent_user_agent || null,
        auto_driving_record: body.auto_driving_record || null,
        home_claims_history: body.home_claims_history || null,
        risk_flag: computeRiskFlag(body.auto_driving_record, body.home_claims_history),
        // V2 wizard fields
        date_of_birth: body.date_of_birth || null,
        street_address: body.street_address || null,
        address_unit: body.address_unit || null,
        city: body.city || null,
        // V2.1 fields
        current_renters_carrier: body.current_renters_carrier || null,
        marital_status: body.marital_status || null,
        address_source: body.address_source || 'manual_entry',
        // Enrichment fields
        vehicle_year: body.vehicle_year ?? null,
        vehicle_make: body.vehicle_make ?? null,
        vehicle_model: body.vehicle_model ?? null,
        vehicle_use: body.vehicle_use ?? null,
        coverage_lapse: body.coverage_lapse ?? null,
        multiple_drivers: body.multiple_drivers ?? null,
        veteran_status: body.veteran_status ?? null,
        current_auto_premium: body.current_auto_premium != null
          ? parseInt(body.current_auto_premium, 10) || null
          : null,
        current_home_premium: body.current_home_premium != null
          ? parseInt(body.current_home_premium, 10) || null
          : null,
        // Home insurance wizard fields
        home_insurance_status: body.home_insurance_status ?? null,
        home_occupancy_type: body.home_occupancy_type ?? null,
        roof_replaced_recently: body.roof_replaced_recently ?? null,
        year_built: body.year_built ?? null,
        square_footage: body.square_footage ?? null,
        stories: body.stories ?? null,
        property_data_source: body.property_data_source ?? null,
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
      agency_id: finalAgencyId,
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
      event_type: finalViaFallback ? 'ROUTING_FALLBACK' : 'ROUTED',
      lead_id: lead.id,
      agency_id: finalAgencyId,
      metadata: {
        routing_rule_id: finalRoutingRuleId,
        geographic_agency_id: routing.agencyId,
        quality_rerouted: finalAgencyId !== routing.agencyId,
        state: state.toUpperCase(),
        zip
      }
    })

    // Get agency users to notify (owner, manager only)
    const { data: agencyUsers } = await supabase
      .from('agency_users')
      .select('user_id, role')
      .eq('agency_id', finalAgencyId)
      .in('role', ['agent', 'manager'])
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
        agency_id: finalAgencyId,
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
      .eq('id', finalAgencyId)
      .single()

    // TODO: Send email notification to agency.email
    // For now, log to console (visible in Supabase logs)
    console.log(`[LEAD NOTIFICATION] New lead ${lead.id} for agency ${agency?.name} (${agency?.email})`)

    // Trigger warm-up SMS (fire-and-forget)
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
          agency_id: lead.agency_id || finalAgencyId,
        }),
      }).catch(smsError => {
        // Don't fail lead creation if SMS fails
        console.error('[CREATE_LEAD] SMS automation fire-and-forget error:', smsError.message)
      })

      // Trigger Bland AI outbound call (fire-and-forget, separate from SMS)
      const blandUrl = `${supabaseUrl}/functions/v1/trigger-bland-outbound`
      fetch(blandUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ lead_id: lead.id }),
      }).catch(blandError => {
        // Don't fail lead creation if Bland call fails
        console.error('[CREATE_LEAD] Bland outbound fire-and-forget error:', blandError.message)
      })
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id: lead.id,
      agency_id: finalAgencyId,
      routed_via_fallback: finalViaFallback,
      quality_rerouted: finalAgencyId !== routing.agencyId
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
