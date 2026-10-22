// Supabase Edge Function: rate-check
// POST /functions/v1/rate-check   (verify_jwt = false — called from the public /ratecheck page)
//
// Also accepts staff uploads from the Rate Checks inbox ({ mode: 'agent' } plus the
// agent's own JWT): the caller's agency membership is verified, no consumer consent
// is recorded (so no auto-texts), and the lead's existing consent is never touched.
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
const POLICY_TYPES = ['auto', 'home', 'renters', 'condo', 'umbrella', 'commercial_auto', 'commercial', 'other']

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

// Rate limiting: DB-backed to survive Edge Function cold starts (same rate_limits
// table as create-lead), but via the atomic rate_limit_hit() upsert — the
// read-then-increment pattern loses counts when requests arrive concurrently.
const RATE_LIMIT = 5 // public requests per minute per IP
const AGENT_RATE_LIMIT = 30 // staff uploads per minute per user
const RATE_WINDOW_SECONDS = 60

async function checkRateLimit(supabase: any, key: string, limit: number): Promise<boolean> {
  const { data, error } = await supabase.rpc('rate_limit_hit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: RATE_WINDOW_SECONDS,
  })
  if (error) {
    // Fail open: never drop a consumer's upload because the limiter hiccuped.
    console.error('[RATE_CHECK] rate limit check failed:', error.message)
    return true
  }
  return data === true
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
      policy_type: {
        type: 'string', enum: POLICY_TYPES,
        description: 'commercial_auto = business vehicles (named insured is a business, or vehicles are commercial); commercial = BOP, general liability, commercial property or workers comp.',
      },
      policy_number: nullable('string', { description: 'Full policy number exactly as printed (all characters, including dashes/spaces). Null if not visible.' }),
      premium: nullable('number', { description: 'TOTAL premium for the whole policy term, in USD — not a monthly/installment amount and not a per-vehicle line.' }),
      term_months: {
        type: ['integer', 'null'], enum: [6, 12, null],
        description: 'Policy term in months ONLY if the page states it (e.g. "6 Month Policy", "Annual") or it is evident from the policy period dates. Null if not shown — do not assume from the carrier.',
      },
      effective_date: nullable('string', { description: 'Policy period start, YYYY-MM-DD.' }),
      expiration_date: nullable('string', { description: 'Policy period end, YYYY-MM-DD.' }),
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
            vin: nullable('string', { description: 'Full VIN exactly as printed (normally 17 characters). If the page masks or truncates it, return only the visible characters, e.g. "XXXX4821" -> "4821".' }),
          },
          required: ['year', 'make', 'model', 'vin'],
        },
      },
      driver_count: nullable('integer'),
      current_agent: {
        type: ['object', 'null'],
        description: 'The servicing agent / agency block printed on the page (often labelled Agent, Your Agent, Producer or Agency). Null if none is printed.',
        properties: {
          agent_name: nullable('string', { description: 'Individual agent name.' }),
          agency_name: nullable('string', { description: 'Agency / business name.' }),
          phone: nullable('string'),
          email: nullable('string'),
          address: nullable('string'),
          agent_code: nullable('string', { description: 'Agent / producer code or number, if printed.' }),
        },
        required: ['agent_name', 'agency_name', 'phone', 'email', 'address', 'agent_code'],
      },
      coverages: {
        type: 'object',
        description:
          'Auto: bi_per_person, bi_per_accident, pd, um_uim, med_pay, comp_deductible, coll_deductible, ' +
          'rental, roadside (per vehicle ok). Home: dwelling, other_structures, personal_property, ' +
          'loss_of_use, liability, med_pay, deductible, wind_hail_deductible. ' +
          'Commercial: liability (per occurrence), aggregate, property, business_income, hired_non_owned, workers_comp. Values as printed.',
      },
      discounts: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: nullable('string', { description: 'Anything odd: multiple policies on page, cut-off, unreadable.' }),
    },
    required: [
      'carrier', 'carrier_raw', 'policy_type', 'policy_number', 'premium', 'term_months',
      'effective_date', 'expiration_date', 'insured_name', 'insured_address', 'vehicles',
      'driver_count', 'current_agent', 'coverages', 'discounts', 'confidence', 'notes',
    ],
  },
}

const INSTRUCTION =
  'This is a photo of an insurance declarations page. Extract the fields precisely as printed. ' +
  'Do not guess a value that is not visible; use null. Copy the policy number and every VIN in full, ' +
  'character for character. Auto policies run 6 or 12 months depending on the carrier, so read the ' +
  'policy period carefully: report term_months 6 or 12 only when the page says so or the effective and ' +
  'expiration dates show it, and report the premium for that whole term (not a monthly installment). ' +
  'If the named insured is a business, or the page is a business owners, general liability or commercial auto policy, use the commercial policy types. ' +
  'Record the servicing agent or agency block exactly as printed, if there is one. ' +
  'If more than one policy appears, pick the primary auto or home policy and mention the others in notes.'

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

// Usual auto policy term by carrier (Georgia), used ONLY when the dec page shows
// neither a term nor a full policy period. Agents can override in the inbox.
// Property lines (home / renters / condo / umbrella) are annual.
// Confirm these against your own book; change here and redeploy.
const CARRIER_AUTO_TERM_MONTHS: Record<string, 6 | 12> = {
  'State Farm': 6,
  'GEICO': 6,
  'Progressive': 6,
  'Allstate': 6,
  'USAA': 6,
  'Farmers': 6,
  'Liberty Mutual': 6,
  'Nationwide': 6,
  'Travelers': 6,
  'Georgia Farm Bureau': 12, // confirmed by the agency
  'Auto-Owners': 12,
  'Erie': 12,
}
const ANNUAL_LINES = new Set(['home', 'renters', 'condo', 'umbrella', 'commercial_auto', 'commercial'])

// Whole months between two ISO dates, snapped to a 6- or 12-month term.
function termFromDates(eff: string | null, exp: string | null): 6 | 12 | null {
  if (!eff || !exp) return null
  const a = new Date(eff + 'T00:00:00Z'), b = new Date(exp + 'T00:00:00Z')
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth())
    + (b.getUTCDate() - a.getUTCDate()) / 30
  if (months >= 5 && months <= 7) return 6
  if (months >= 11 && months <= 13) return 12
  return null
}

// VIN check digit (position 9) per 49 CFR 565 — catches misreads like 8↔B, 5↔S.
const VIN_VALUES: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
}
const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]
function vinCheckDigitOk(vin: string): boolean {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false
  let sum = 0
  for (let i = 0; i < 17; i++) {
    const c = vin[i]
    sum += (/[0-9]/.test(c) ? Number(c) : VIN_VALUES[c]) * VIN_WEIGHTS[i]
  }
  const r = sum % 11
  return vin[8] === (r === 10 ? 'X' : String(r))
}

function cleanVehicle(v: any) {
  let vin = v?.vin ? String(v.vin).toUpperCase().replace(/[^A-Z0-9]/g, '') : null
  // Masked VINs ("XXXXXXXXXXXXX9137"): keep only the visible tail.
  if (vin && /^X{4,}/.test(vin) && !vinCheckDigitOk(vin)) vin = vin.replace(/^X+/, '')
  return {
    year: Number.isInteger(v?.year) ? v.year : null,
    make: cleanText(v?.make, 40),
    model: cleanText(v?.model, 60),
    vin: vin || null,
    vin_last4: vin ? vin.slice(-4) : null,
    vin_complete: !!vin && vin.length === 17,
    vin_valid: !!vin && vin.length === 17 && vinCheckDigitOk(vin),
  }
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
  const carrier = CARRIERS.includes(x.carrier) ? x.carrier : 'Other'
  const policyType = POLICY_TYPES.includes(x.policy_type) ? x.policy_type : 'other'
  const effective = isoDateOrNull(x.effective_date)
  const expiration = isoDateOrNull(x.expiration_date)
  let confidence = ['high', 'medium', 'low'].includes(x.confidence) ? x.confidence : 'low'

  // Term: the printed policy period wins, then a printed term, then the carrier's
  // usual auto term, then annual for property lines.
  const printedTerm = x.term_months === 6 || x.term_months === 12 ? x.term_months : null
  const datesTerm = termFromDates(effective, expiration)
  let term: 6 | 12 | null = null
  let termSource = 'unknown'
  if (datesTerm) { term = datesTerm; termSource = 'dates' }
  else if (printedTerm) { term = printedTerm; termSource = 'printed' }
  else if (policyType === 'auto' && CARRIER_AUTO_TERM_MONTHS[carrier]) {
    term = CARRIER_AUTO_TERM_MONTHS[carrier]; termSource = 'carrier_default'
    if (confidence === 'high') confidence = 'medium'
  } else if (ANNUAL_LINES.has(policyType)) { term = 12; termSource = 'line_default' }

  let annual: number | null = null
  if (premium != null && term) {
    annual = Math.round(premium * (12 / term) * 100) / 100
  } else if (premium != null) {
    // No term at all — treat the printed premium as annual, but flag it.
    annual = premium
    confidence = 'low'
  }

  const vehicles = Array.isArray(x.vehicles) ? x.vehicles.map(cleanVehicle) : []
  const policyNumber = x.policy_number ? String(x.policy_number).trim().slice(0, 64) : null
  const policyAlnum = policyNumber ? policyNumber.replace(/[^A-Za-z0-9]/g, '') : ''

  return {
    carrier,
    policy_type: policyType,
    policy_number: policyNumber,
    policy_number_last4: policyAlnum ? policyAlnum.slice(-4) : null,
    current_premium: premium,
    term_months: term,
    term_source: termSource,
    annual_premium: annual,
    effective_date: effective,
    expiration_date: expiration,
    vehicle_count: vehicles.length || null,
    driver_count: Number.isInteger(x.driver_count) ? x.driver_count : null,
    vehicles,
    coverages: x.coverages && typeof x.coverages === 'object' ? x.coverages : null,
    insured_address: cleanText(x.insured_address, 500),
    current_agent: cleanAgent(x.current_agent),
    extract_confidence: confidence,
  }
}

function cleanAgent(a: any) {
  if (!a || typeof a !== 'object') return null
  const out = {
    agent_name: cleanText(a.agent_name, 120),
    agency_name: cleanText(a.agency_name, 160),
    phone: cleanText(a.phone, 40),
    email: cleanText(a.email, 160),
    address: cleanText(a.address, 300),
    agent_code: cleanText(a.agent_code, 40),
  }
  return Object.values(out).some(Boolean) ? out : null
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

// audit_log.event_type is allowlisted (see the *_audit_log_rate_check_events
// migration); log instead of failing silently if an insert is rejected.
async function audit(supabase: any, row: Record<string, unknown>) {
  const { error } = await supabase.from('audit_log').insert(row)
  if (error) console.error('[RATE_CHECK] audit insert failed:', row.event_type, error.message)
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

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders)
  }

  // ── Staff upload (Rate Checks inbox): verify the caller and their agency ──
  let staff: { userId: string; agencyId: string } | null = null
  if (body?.mode === 'agent') {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: authData } = token ? await supabase.auth.getUser(token) : { data: { user: null } }
    const user = authData?.user
    if (!user) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
    let mq = supabase
      .from('agency_memberships')
      .select('agency_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .in('agency_role', ['owner', 'principal', 'manager', 'producer'])
    if (body.agency_id) mq = mq.eq('agency_id', body.agency_id)
    const { data: memberships } = await mq.limit(1)
    if (!memberships?.length) return jsonResponse({ error: 'Access denied' }, 403, corsHeaders)
    staff = { userId: user.id, agencyId: memberships[0].agency_id }
  }

  const limited = staff
    ? !(await checkRateLimit(supabase, `rate_check_agent:${staff.userId}`, AGENT_RATE_LIMIT))
    : !(await checkRateLimit(supabase, `rate_check:${clientIp}`, RATE_LIMIT))
  if (limited) {
    return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders)
  }

  // ── Validate ──
  const phone = String(body.phone || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  const zip = String(body.zip || '').trim()
  const mediaType = String(body.media_type || '').toLowerCase()
  const imageBase64 = typeof body.image_base64 === 'string'
    ? body.image_base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '')
    : ''

  const errors: string[] = []
  if (phone.length !== 10) errors.push('phone must be a 10-digit US number')
  // ZIP is optional for staff uploads (an emailed dec page may not need it typed in).
  if (staff ? (zip && !/^\d{5}$/.test(zip)) : !/^\d{5}$/.test(zip)) errors.push('zip must be 5 digits')
  if (!staff && (!body.consent_given_at || Number.isNaN(Date.parse(body.consent_given_at)))) {
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
  // Staff uploads carry no consumer consent — never record (or overwrite) any.
  const consent = staff ? {} : {
    consent_given_at: new Date(body.consent_given_at).toISOString(),
    consent_ip: consentIp,
    consent_version: cleanText(body.consent_version, 64),
    consent_user_agent: cleanText(body.consent_user_agent || req.headers.get('user-agent'), 512),
  }
  // Separate, optional opt-in for partner referrals (#5) — never implied by the call/text consent.
  const referralConsent = !staff && body.referral_consent_given_at && !Number.isNaN(Date.parse(body.referral_consent_given_at))
    ? {
        referral_consent_given_at: new Date(body.referral_consent_given_at).toISOString(),
        referral_consent_version: cleanText(body.referral_consent_version, 64),
        referral_consent_ip: consentIp,
      }
    : {}
  const sessionId = cleanText(body.session_id, 64) || crypto.randomUUID()
  const landingPage = staff ? 'agent_upload' : cleanText(body.landing_page, 512)

  try {
    // ── Resolve agency ──
    // routing: rate checks currently all land on the default agency. When
    // multi-agency Rate Check ships, route here (e.g. by landing domain or
    // routing_rules state/zip, like create-lead's routeLead) before inserting.
    // Staff uploads go to the uploader's own agency.
    const { data: defaultAgency } = staff
      ? { data: { id: staff.agencyId } }
      : await supabase.from('agencies').select('id').eq('is_default', true).single()
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
        zip: zip || null,
        upload_source: staff ? 'agent' : 'consumer',
        uploaded_by: staff?.userId ?? null,
        ...consent,
        ...referralConsent,
        ...sanitizedUtm,
        landing_page: landingPage,
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) throw insErr
    const rateCheckId = rc.id

    await audit(supabase, {
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

      // Competing-agent intel (internal only): match/create the agent and link it.
      if (flat.current_agent) {
        const ca = flat.current_agent
        const { data: competitorId, error: caErr } = await supabase.rpc('upsert_competitor_agent', {
          p_agency_id: agencyId, p_carrier: flat.carrier, p_agent_name: ca.agent_name,
          p_agency_name: ca.agency_name, p_phone: ca.phone, p_email: ca.email,
          p_address: ca.address, p_agent_code: ca.agent_code,
        })
        if (caErr) console.error('[RATE_CHECK] competitor agent upsert failed:', caErr.message)
        else if (competitorId) {
          await supabase.from('rate_checks').update({ competitor_agent_id: competitorId }).eq('id', rateCheckId)
        }
      }
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

    await audit(supabase, {
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
            ...(zip ? { zip } : {}),
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
            source: staff ? 'rate_check_agent' : 'rate_check',
            status: 'new',
            state: 'GA',
            zip: zip || null,
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

    // The uploading agent is already working a staff upload — only notify for consumer uploads.
    if (!staff && members && members.length > 0) {
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
