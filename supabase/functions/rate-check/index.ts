// Supabase Edge Function: rate-check
// POST /functions/v1/rate-check   (verify_jwt = false — called from the public /ratecheck page)
//
// A consumer uploads a photo/PDF of their current declarations page. We:
//   1. store a rate_checks row (status 'pending') + the image in the private dec-pages bucket,
//   2. extract the policy with Claude (forced tool use → guaranteed JSON),
//   3. create/update a lead (source 'rate_check') WITHOUT firing the SMS/Bland
//      automation that create-lead triggers,
//   4. audit + notify the agency.
// The consumer only ever gets back carrier / policy type / annual premium — never PII
// or the full extraction. Extraction failures still return 200 so no lead is lost.
//
// Secrets (Supabase Function secrets, NOT VITE_ vars):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   (optional) supabase secrets set RATE_CHECK_MODEL=claude-sonnet-4-5

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS — inline to match create-lead (avoids _shared bundling issues)
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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

const ANTHROPIC_MODEL = Deno.env.get('RATE_CHECK_MODEL') || 'claude-sonnet-4-5'
const BUCKET = 'dec-pages'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}
// Claude reads these directly; HEIC is stored for the agent but not extracted.
const EXTRACTABLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

const CARRIERS = [
  'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual',
  'Nationwide', 'Travelers', 'Auto-Owners', 'Georgia Farm Bureau', 'Erie', 'Other',
]
const POLICY_TYPES = ['auto', 'home', 'renters', 'condo', 'umbrella', 'other']

function sanitizeUtm(val: string | null | undefined): string | null {
  if (!val) return null
  return String(val).slice(0, 256).replace(/<[^>]*>/g, '')
}

function cleanText(val: unknown, max = 256): string | null {
  if (val == null || val === '') return null
  return String(val).slice(0, max).replace(/<[^>]*>/g, '')
}

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Rate limiting: DB-backed to survive Edge Function cold starts (same as create-lead)
const RATE_LIMIT = 5 // requests per minute
const RATE_WINDOW = 60_000 // 1 minute

async function checkRateLimit(supabase: any, ip: string): Promise<boolean> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + RATE_WINDOW)
  const key = `rate_check:${ip}`

  const { data: existing } = await supabase
    .from('rate_limits')
    .select('count, reset_at')
    .eq('key', key)
    .single()

  if (!existing || new Date(existing.reset_at) <= now) {
    await supabase
      .from('rate_limits')
      .upsert({ key, count: 1, reset_at: windowEnd.toISOString() }, { onConflict: 'key' })
    return true
  }

  if (existing.count >= RATE_LIMIT) return false

  await supabase
    .from('rate_limits')
    .update({ count: existing.count + 1 })
    .eq('key', key)

  return true
}

function base64DecodedSize(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ── Claude extraction ────────────────────────────────────────────────────────

const nullable = (type: string, extra: Record<string, unknown> = {}) => ({ type: [type, 'null'], ...extra })

const EXTRACTION_TOOL = {
  name: 'record_dec_page',
  description:
    'Record the policy details read from a photo of an insurance declarations page. ' +
    'Use null for anything not clearly visible.',
  input_schema: {
    type: 'object',
    properties: {
      carrier: { type: 'string', enum: CARRIERS, description: 'Normalized carrier name; "Other" if not in the list.' },
      carrier_raw: { type: 'string', description: 'Carrier / company name exactly as printed.' },
      policy_type: { type: 'string', enum: POLICY_TYPES },
      policy_number_last4: nullable('string', { description: 'Last 4 characters of the policy number only.' }),
      premium: nullable('number', { description: 'Total premium printed for the policy term, in USD.' }),
      term_months: { type: ['integer', 'null'], enum: [6, 12, null], description: 'Policy term length in months.' },
      effective_date: nullable('string', { description: 'YYYY-MM-DD' }),
      expiration_date: nullable('string', { description: 'YYYY-MM-DD' }),
      insured_name: nullable('string'),
      insured_address: nullable('string'),
      vehicles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            year: nullable('integer'),
            make: nullable('string'),
            model: nullable('string'),
            vin_last4: nullable('string'),
          },
          required: ['year', 'make', 'model', 'vin_last4'],
        },
      },
      driver_count: nullable('integer'),
      coverages: {
        type: 'object',
        description:
          'Auto: bi_per_person, bi_per_accident, pd, um_uim, med_pay, comp_deductible, coll_deductible, ' +
          'rental, roadside (per vehicle ok). Home: dwelling, other_structures, personal_property, ' +
          'loss_of_use, liability, med_pay, deductible, wind_hail_deductible. Values as printed.',
      },
      discounts: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: nullable('string', { description: 'Anything odd: multiple policies on page, cut-off, unreadable.' }),
    },
    required: [
      'carrier', 'carrier_raw', 'policy_type', 'policy_number_last4', 'premium', 'term_months',
      'effective_date', 'expiration_date', 'insured_name', 'insured_address', 'vehicles',
      'driver_count', 'coverages', 'discounts', 'confidence', 'notes',
    ],
  },
}

const INSTRUCTION =
  'This is a photo of an insurance declarations page. Extract the fields precisely as printed. ' +
  'Do not guess a value that is not visible; use null. If the page shows a 6-month term, report ' +
  'term_months 6. If more than one policy appears, pick the primary auto or home policy and ' +
  'mention the others in notes.'

async function extractDecPage(apiKey: string, base64: string, mediaType: string) {
  const fileBlock = mediaType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

  const callClaude = async (toolChoice: Record<string, string>) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 60_000)
    try {
      return await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 1500,
          tools: [EXTRACTION_TOOL],
          tool_choice: toolChoice,
          messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: INSTRUCTION }] }],
        }),
      })
    } finally {
      clearTimeout(timer)
    }
  }

  let res = await callClaude({ type: 'tool', name: 'record_dec_page' })
  if (res.status === 400) {
    // Newer models (e.g. if RATE_CHECK_MODEL is overridden) reject forced tool_choice;
    // retry once with auto — the instruction + single tool still steer it to the tool.
    const errText = await res.text()
    if (!errText.includes('tool_choice')) {
      throw new Error(`Anthropic API error (400): ${errText.slice(0, 500)}`)
    }
    res = await callClaude({ type: 'auto' })
  }
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errText.slice(0, 500)}`)
  }

  const result = await res.json()
  if (result.stop_reason === 'refusal') throw new Error('Model declined to read the document')
  const toolUse = (result.content || []).find(
    (b: any) => b.type === 'tool_use' && b.name === 'record_dec_page'
  )
  if (!toolUse?.input) throw new Error('Model did not return structured dec-page data')
  return { input: toolUse.input, usage: result.usage ?? null }
}

function isoDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  return Number.isNaN(Date.parse(v)) ? null : v
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v.replace(/[$,]/g, '')) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}

// Flatten the tool input onto rate_checks columns.
function flatten(x: any) {
  const premium = numOrNull(x.premium)
  const term = x.term_months === 6 || x.term_months === 12 ? x.term_months : null
  let confidence = ['high', 'medium', 'low'].includes(x.confidence) ? x.confidence : 'low'
  let annual: number | null = null
  if (premium != null && term) {
    annual = Math.round(premium * (12 / term) * 100) / 100
  } else if (premium != null) {
    // Term not visible — assume the printed premium is annual, but flag it.
    annual = premium
    confidence = 'low'
  }
  const vehicles = Array.isArray(x.vehicles) ? x.vehicles : []
  const last4 = x.policy_number_last4 ? String(x.policy_number_last4).replace(/\s/g, '').slice(-4) : null

  return {
    carrier: CARRIERS.includes(x.carrier) ? x.carrier : 'Other',
    policy_type: POLICY_TYPES.includes(x.policy_type) ? x.policy_type : 'other',
    policy_number_last4: last4,
    current_premium: premium,
    term_months: term,
    annual_premium: annual,
    effective_date: isoDateOrNull(x.effective_date),
    expiration_date: isoDateOrNull(x.expiration_date),
    vehicle_count: vehicles.length || null,
    driver_count: Number.isInteger(x.driver_count) ? x.driver_count : null,
    vehicles,
    coverages: x.coverages && typeof x.coverages === 'object' ? x.coverages : null,
    insured_address: cleanText(x.insured_address, 500),
    extract_confidence: confidence,
  }
}

// ── Lead mapping ─────────────────────────────────────────────────────────────

function leadFieldsFor(policyType: string | null, carrier: string | null, annual: number | null) {
  const premium = annual != null ? Math.round(annual) : null
  const fields: Record<string, unknown> = {
    product_intent: policyType === 'auto' || policyType === 'home' || policyType === 'renters'
      ? policyType
      : 'bundle',
  }
  if (policyType === 'home' || policyType === 'condo') {
    fields.owns_home = true
    fields.housing_situation = 'own'
    fields.current_home_carrier = carrier
    fields.current_home_premium = premium
  } else if (policyType === 'renters') {
    fields.owns_home = false
    fields.housing_situation = 'rent'
    fields.current_renters_carrier = carrier
  } else if (policyType === 'auto') {
    fields.current_auto_carrier = carrier
    fields.current_auto_premium = premium
  }
  return fields
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  const clientIp = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const supabase = createClient(supabaseUrl, supabaseKey)

  if (!(await checkRateLimit(supabase, clientIp))) {
    return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders)
  }

  // ── Validate ──
  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders)
  }

  const phone = String(body.phone || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  const zip = String(body.zip || '').trim()
  const mediaType = String(body.media_type || '').toLowerCase()
  const imageBase64 = typeof body.image_base64 === 'string'
    ? body.image_base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
    : ''

  const errors: string[] = []
  if (phone.length !== 10) errors.push('phone must be a 10-digit US number')
  if (!/^\d{5}$/.test(zip)) errors.push('zip must be 5 digits')
  if (!body.consent_given_at || Number.isNaN(Date.parse(body.consent_given_at))) {
    errors.push('consent_given_at is required')
  }
  if (!MEDIA_TYPES[mediaType]) errors.push('media_type not allowed')
  if (!imageBase64) errors.push('image_base64 is required')
  else if (base64DecodedSize(imageBase64) > MAX_IMAGE_BYTES) errors.push('image exceeds 10 MB')
  if (errors.length) {
    return jsonResponse({ error: errors.join('; ') }, 400, corsHeaders)
  }

  const firstName = cleanText(body.first_name, 80)
  const consentIp = clientIp !== 'unknown' ? clientIp : null
  const sanitizedUtm = {
    utm_source: sanitizeUtm(body.utm_source),
    utm_medium: sanitizeUtm(body.utm_medium),
    utm_campaign: sanitizeUtm(body.utm_campaign),
    utm_content: sanitizeUtm(body.utm_content),
    utm_term: sanitizeUtm(body.utm_term),
  }
  const consent = {
    consent_given_at: new Date(body.consent_given_at).toISOString(),
    consent_ip: consentIp,
    consent_version: cleanText(body.consent_version, 64),
    consent_user_agent: cleanText(body.consent_user_agent || req.headers.get('user-agent'), 512),
  }
  const sessionId = cleanText(body.session_id, 64) || crypto.randomUUID()
  const landingPage = cleanText(body.landing_page, 512)

  try {
    // ── Resolve agency ──
    // routing: rate checks currently all land on the default agency. When
    // multi-agency Rate Check ships, route here (e.g. by landing domain or
    // routing_rules state/zip, like create-lead's routeLead) before inserting.
    const { data: defaultAgency } = await supabase
      .from('agencies')
      .select('id')
      .eq('is_default', true)
      .single()
    const agencyId = defaultAgency?.id
    if (!agencyId) throw new Error('No default agency configured')

    // ── 1. Pending row ──
    const { data: rc, error: insErr } = await supabase
      .from('rate_checks')
      .insert({
        agency_id: agencyId,
        session_id: sessionId,
        first_name: firstName,
        phone,
        zip,
        ...consent,
        ...sanitizedUtm,
        landing_page: landingPage,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) throw insErr
    const rateCheckId = rc.id

    await supabase.from('audit_log').insert({
      event_type: 'RATE_CHECK_RECEIVED',
      agency_id: agencyId,
      ip_address: consentIp,
      metadata: { rate_check_id: rateCheckId, media_type: mediaType, zip },
    })

    // ── 2. Store image ──
    const imagePath = `${agencyId}/${rateCheckId}.${MEDIA_TYPES[mediaType]}`
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(imagePath, base64ToBytes(imageBase64), { contentType: mediaType, upsert: true })
    if (upErr) {
      console.error('[RATE_CHECK] Image upload failed:', upErr.message)
    } else {
      await supabase
        .from('rate_checks')
        .update({ image_path: imagePath, image_media_type: mediaType })
        .eq('id', rateCheckId)
    }

    // ── 3. Extract ──
    let flat: ReturnType<typeof flatten> | null = null
    let extractError: string | null = null
    try {
      if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not configured')
      if (!EXTRACTABLE.has(mediaType)) throw new Error(`Cannot extract ${mediaType}; agent must review image`)
      const { input, usage } = await extractDecPage(anthropicKey, imageBase64, mediaType)
      flat = flatten(input)
      const { error: updErr } = await supabase
        .from('rate_checks')
        .update({
          status: 'extracted',
          extracted: { ...input, model: ANTHROPIC_MODEL, usage },
          extracted_at: new Date().toISOString(),
          extract_error: null,
          ...flat,
        })
        .eq('id', rateCheckId)
      if (updErr) throw updErr
    } catch (e) {
      extractError = (e as Error).message || 'Extraction failed'
      console.error('[RATE_CHECK] Extraction failed:', extractError)
      flat = null
      await supabase
        .from('rate_checks')
        .update({ status: 'extract_failed', extract_error: extractError.slice(0, 1000) })
        .eq('id', rateCheckId)
    }

    const carrier = flat?.carrier ?? null
    const policyType = flat?.policy_type ?? null
    const annualPremium = flat?.annual_premium ?? null

    await supabase.from('audit_log').insert({
      event_type: flat ? 'RATE_CHECK_EXTRACTED' : 'RATE_CHECK_FAILED',
      agency_id: agencyId,
      metadata: {
        rate_check_id: rateCheckId,
        carrier,
        policy_type: policyType,
        annual_premium: annualPremium,
        confidence: flat?.extract_confidence ?? null,
        ...(extractError ? { error: extractError.slice(0, 300) } : {}),
      },
    })

    // ── 4. Lead (direct insert/update — no SMS/Bland automation) ──
    let leadId: string | null = null
    try {
      const policyFields = flat ? leadFieldsFor(policyType, carrier, annualPremium) : {}
      if (flat) policyFields.vehicle_count = flat.vehicle_count

      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, status')
        .eq('agency_id', agencyId)
        .eq('phone', phone)
        .not('status', 'in', '(closed_won,closed_lost)')
        .order('created_at', { ascending: false })
        .limit(1)
      const existing = existingLeads?.[0]

      if (existing) {
        const { error } = await supabase
          .from('leads')
          .update({
            ...(firstName ? { first_name: firstName } : {}),
            zip,
            ...consent,
            ...policyFields,
            ...(existing.status === 'partial' ? { status: 'new' } : {}),
          })
          .eq('id', existing.id)
        if (error) throw error
        leadId = existing.id
      } else {
        const { data: lead, error } = await supabase
          .from('leads')
          .insert({
            agency_id: agencyId,
            source: 'rate_check',
            status: 'new',
            state: 'GA',
            zip,
            first_name: firstName,
            phone,
            ...consent,
            ...sanitizedUtm,
            landing_page: landingPage,
            session_id: sessionId,
            ...(flat ? policyFields : { product_intent: 'bundle' }),
          })
          .select('id')
          .single()
        if (error) throw error
        leadId = lead.id
      }

      await supabase.from('rate_checks').update({ lead_id: leadId }).eq('id', rateCheckId)
      await supabase.from('audit_log').update({ lead_id: leadId })
        .eq('agency_id', agencyId)
        .in('event_type', ['RATE_CHECK_RECEIVED', 'RATE_CHECK_EXTRACTED', 'RATE_CHECK_FAILED'])
        .eq('metadata->>rate_check_id', rateCheckId)
    } catch (e) {
      // The rate_checks row still holds contact + consent; the agent can work it from the inbox.
      console.error('[RATE_CHECK] Lead create/update failed:', (e as Error).message)
    }

    // ── 5. Notify agency staff (in-app) ──
    const { data: members } = await supabase
      .from('agency_memberships')
      .select('user_id')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .in('agency_role', ['owner', 'principal', 'manager', 'producer'])

    if (members && members.length > 0) {
      const premiumText = annualPremium != null ? `$${Math.round(annualPremium).toLocaleString('en-US')}/yr` : '$?/yr'
      const message = `${firstName || 'Someone'} · ${carrier || 'Unknown carrier'} ${policyType || 'policy'} · ${premiumText} · ${zip}`
      const uniqueUsers = [...new Set(members.map((m: any) => m.user_id))]
      await supabase.from('notifications').insert(uniqueUsers.map(userId => ({
        user_id: userId,
        type: 'NEW_RATE_CHECK',
        title: 'New Rate Check',
        message,
        metadata: { rate_check_id: rateCheckId, lead_id: leadId },
      })))
    }

    return jsonResponse({
      status: 'received',
      rate_check_id: rateCheckId,
      carrier,
      policy_type: policyType,
      annual_premium: annualPremium,
    }, 200, corsHeaders)
  } catch (error) {
    console.error('[RATE_CHECK] Error:', error)
    return jsonResponse({ error: 'Something went wrong. Please try again.' }, 500, corsHeaders)
  }
})
