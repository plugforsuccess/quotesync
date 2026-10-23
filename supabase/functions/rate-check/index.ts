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
// The same policy sent twice (same phone + policy number, or carrier + price) stays one
// card: the existing one is marked "sent again" and the new row is hidden as a duplicate.
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

// Carriers we see in Georgia. Anything else is 'Other' and carrier_raw keeps what was printed.
const CARRIERS = [
  'State Farm', 'GEICO', 'Progressive', 'Allstate', 'USAA', 'Farmers', 'Liberty Mutual',
  'Nationwide', 'Travelers', 'Auto-Owners', 'Georgia Farm Bureau', 'Erie',
  'American Family', 'Country Financial', 'Safeco', 'Mercury', 'National General', 'The Hartford',
  'Amica', 'Kemper', 'Direct Auto', 'The General', 'Root', 'Lemonade', 'Chubb', 'Cincinnati',
  'Encompass', 'Foremost', 'Grange', 'The Hanover', 'Shelter', 'Homesite', 'Openly', 'Branch',
  'Bristol West', 'Infinity', 'Esurance', 'Other',
]
const POLICY_TYPES = ['auto', 'home', 'renters', 'condo', 'umbrella', 'commercial_auto', 'commercial', 'other']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
// Texted-code verification of the consumer's number: off until the agency turns it on.
//   supabase secrets set RATE_CHECK_OTP_REQUIRED=true
const OTP_REQUIRED = Deno.env.get('RATE_CHECK_OTP_REQUIRED') === 'true'

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
const LOOKUP_RATE_LIMIT = 30 // invite-link opens per minute per IP
const AGENT_RATE_LIMIT = 30 // staff uploads per minute per user
const HOUSEHOLD_RATE_LIMIT = 20 // a household's 2nd, 3rd… policy, per minute per session
const RATE_WINDOW_SECONDS = 60

// A follow-up policy from someone who already sent one: same session, phone and IP, recently.
async function householdFollowUpKey(supabase: any, body: any, clientIp: string): Promise<string | null> {
  const sessionId = typeof body?.session_id === 'string' ? body.session_id.slice(0, 64) : ''
  const phone = String(body?.phone || '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  if (!sessionId || phone.length !== 10 || clientIp === 'unknown') return null
  const { data } = await supabase
    .from('rate_checks')
    .select('id')
    .eq('session_id', sessionId)
    .eq('phone', phone)
    .eq('consent_ip', clientIp)
    .gte('created_at', new Date(Date.now() - 30 * 60 * 1000).toISOString())
    .limit(1)
  return data?.length ? `rate_check_household:${sessionId}` : null
}

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
            number: nullable('string', { description: 'Vehicle number as printed (e.g. "001", "Veh 2"). Null if none.' }),
            usage: nullable('string', { description: 'How the vehicle is rated, as printed: e.g. "Pleasure", "Commute 12 mi", "Business", "Farm". If one usage is printed for all vehicles, repeat it on each.' }),
            annual_mileage: nullable('integer', { description: 'Annual miles if printed.' }),
            lienholder: nullable('string', { description: 'Lienholder / loss payee / creditor / lessor for THIS vehicle, name only, e.g. "TD Auto Finance".' }),
            coverages: {
              type: ['object', 'null'],
              description: 'Coverages printed for THIS vehicle, values as printed: comp_deductible, coll_deductible, rental, roadside. Null if none are printed per vehicle.',
            },
          },
          required: ['year', 'make', 'model', 'vin', 'number', 'usage', 'annual_mileage', 'lienholder', 'coverages'],
        },
      },
      driver_count: nullable('integer'),
      drivers: {
        type: 'array',
        description: 'Every driver listed on the page (rated, listed, or excluded).',
        items: {
          type: 'object',
          properties: {
            name: nullable('string', { description: 'Full name as printed, including Jr / Sr / II if shown.' }),
            age: nullable('integer', { description: 'Age if printed, or derived from a printed date of birth.' }),
            status: nullable('string', { description: 'As printed: rated, listed, excluded, occasional, principal.' }),
            usage: nullable('string', { description: 'Driver-level usage or assigned vehicle, if printed.' }),
          },
          required: ['name', 'age', 'status', 'usage'],
        },
      },
      surcharges: {
        type: 'array', items: { type: 'string' },
        description: 'Accident / violation / at-fault surcharges or points printed on the page, one string each with the date if shown, e.g. "At-fault accident 03/2024", "Speeding 11/2023". Empty if none printed.',
      },
      claims: {
        type: 'array', items: { type: 'string' },
        description: 'Claims or losses printed on the page, one string each with date and amount if shown, e.g. "Hail claim 06/2023 $4,200". Empty if none printed.',
      },
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
          'Auto: bi_per_person, bi_per_accident, pd, um_uim, med_pay, and comp_deductible, coll_deductible, rental, roadside ' +
          'only when they are the same for every vehicle (otherwise put them on each vehicle). Home: dwelling, other_structures, personal_property, ' +
          'loss_of_use, liability, med_pay, deductible, wind_hail_deductible. ' +
          'Commercial: liability (per occurrence), aggregate, property, business_income, hired_non_owned, workers_comp. Values as printed.',
      },
      property: {
        type: ['object', 'null'],
        description: 'Home / condo / renters only: facts about the building. Null for other policies.',
        properties: {
          year_built: nullable('integer'),
          construction: nullable('string', { description: 'As printed, e.g. "Masonry Veneer", "Frame".' }),
          roof_material: nullable('string'),
          roof_year: nullable('integer', { description: 'Year the roof was installed / replaced, if printed.' }),
          square_feet: nullable('integer'),
          stories: nullable('number'),
          mortgagee: nullable('string', { description: 'First mortgagee / lender name.' }),
          loan_number: nullable('string'),
          paid_by_mortgagee: nullable('boolean', { description: 'True if the premium is paid by the mortgagee (escrow).' }),
        },
        required: ['year_built', 'construction', 'roof_material', 'roof_year', 'square_feet', 'stories', 'mortgagee', 'loan_number', 'paid_by_mortgagee'],
      },
      endorsements: {
        type: 'array',
        description: 'Every endorsement, option or rider printed, one each. Empty if none.',
        items: {
          type: 'object',
          properties: {
            code: nullable('string', { description: 'Form or option code as printed, e.g. "HO-2444.2", "Option OL".' }),
            name: { type: 'string', description: 'Plain name, e.g. "Back-up of sewer or drain".' },
            limit: nullable('string', { description: 'Limit or amount as printed, e.g. "5% of Coverage A / $56,515".' }),
          },
          required: ['code', 'name', 'limit'],
        },
      },
      discounts: { type: 'array', items: { type: 'string' }, description: 'Short discount names only, e.g. "Multicar", "Good student", "Accident-free 2 yrs". No explanations.' },
      summary: nullable('string', { description: 'One short, plain sentence a producer must know before quoting that is NOT already in the fields above (the policy dates and term are already shown — do not restate them). Name vehicles by year, make and model, never by the page\'s vehicle number; spell out months and words, no abbreviations; no carrier boilerplate (e.g. "The 2021 Land Rover Velar was added mid-term; all vehicles renew together for a full term after that."). Null if nothing.' }),
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      notes: nullable('string', { description: 'Anything odd: multiple policies on page, cut-off, unreadable.' }),
    },
    required: [
      'carrier', 'carrier_raw', 'policy_type', 'policy_number', 'premium', 'term_months',
      'effective_date', 'expiration_date', 'insured_name', 'insured_address', 'vehicles',
      'driver_count', 'drivers', 'surcharges', 'claims', 'current_agent', 'coverages', 'property', 'endorsements', 'discounts', 'summary', 'confidence', 'notes',
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
  'List every driver on the page with their status (rated, listed, excluded) and age if shown, each vehicle\'s usage ' +
  'and annual miles if shown, and any surcharges (accidents, violations, points) or claims printed, with dates. ' +
  'Put anything printed per vehicle (deductibles, rental, roadside, lienholder) on that vehicle. ' +
  'For home policies, record the building facts, mortgagee and every endorsement in their own fields, not in notes. ' +
  'Record the servicing agent or agency block exactly as printed, if there is one. ' +
  'The upload may be several pages of the same policy (drivers, vehicles and coverages often continue on later ' +
  'pages): read every page and combine them into one record. ' +
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
          max_tokens: 3000,
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
  'Safeco': 6,
  'Mercury': 6,
  'National General': 6,
  'The General': 6,
  'Direct Auto': 6,
  'Root': 6,
  'Bristol West': 6,
  'Infinity': 6,
  'Esurance': 6,
  'Kemper': 6,
  'Chubb': 12,
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
    number: cleanText(v?.number, 20),
    usage: cleanText(v?.usage, 80),
    annual_mileage: Number.isInteger(v?.annual_mileage) && v.annual_mileage > 0 ? v.annual_mileage : null,
    lienholder: cleanText(v?.lienholder, 120),
    coverages: cleanCoverages(v?.coverages),
  }
}

function cleanCoverages(c: any): Record<string, string> | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(c)) {
    if (v == null || v === '') continue
    out[String(k).slice(0, 40)] = cleanText(typeof v === 'object' ? JSON.stringify(v) : v, 120) as string
  }
  return Object.keys(out).length ? out : null
}

function cleanProperty(p: any) {
  if (!p || typeof p !== 'object') return null
  const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? v : null
  const out = {
    year_built: int(p.year_built, 1700, 2100),
    construction: cleanText(p.construction, 80),
    roof_material: cleanText(p.roof_material, 80),
    roof_year: int(p.roof_year, 1900, 2100),
    square_feet: int(p.square_feet, 100, 100000),
    stories: typeof p.stories === 'number' && p.stories > 0 && p.stories < 20 ? p.stories : null,
    mortgagee: cleanText(p.mortgagee, 160),
    loan_number: cleanText(p.loan_number, 40),
    paid_by_mortgagee: typeof p.paid_by_mortgagee === 'boolean' ? p.paid_by_mortgagee : null,
  }
  return Object.values(out).some(v => v != null) ? out : null
}

function cleanEndorsements(v: unknown) {
  if (!Array.isArray(v)) return []
  return v
    .map((e: any) => ({ code: cleanText(e?.code, 40), name: cleanText(e?.name, 160), limit: cleanText(e?.limit, 120) }))
    .filter(e => e.name)
    .slice(0, 40)
}

function cleanDriver(d: any) {
  return {
    name: cleanText(d?.name, 80),
    age: Number.isInteger(d?.age) && d.age > 0 && d.age < 120 ? d.age : null,
    status: cleanText(d?.status, 40),
    usage: cleanText(d?.usage, 80),
  }
}

function cleanList(v: unknown, max = 20): string[] {
  return Array.isArray(v) ? v.map(x => cleanText(x, 200)).filter((x): x is string => !!x).slice(0, max) : []
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
  const drivers = Array.isArray(x.drivers) ? x.drivers.map(cleanDriver).filter((d: any) => d.name || d.age || d.status) : []
  const policyNumber = x.policy_number ? String(x.policy_number).trim().slice(0, 64) : null
  const policyAlnum = policyNumber ? policyNumber.replace(/[^A-Za-z0-9]/g, '') : ''

  return {
    carrier,
    carrier_raw: cleanText(x.carrier_raw, 120),
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
    driver_count: Number.isInteger(x.driver_count) ? x.driver_count : (drivers.length || null),
    vehicles,
    drivers,
    surcharges: cleanList(x.surcharges),
    claims: cleanList(x.claims),
    property: cleanProperty(x.property),
    endorsements: cleanEndorsements(x.endorsements),
    summary: cleanText(x.summary, 600),
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

// Read the dec page and store the result on the row (status extracted / extract_failed),
// then link the competing agent. Shared by the first scan and "Scan again".
async function extractAndStore(supabase: any, anthropicKey: string | undefined, rateCheckId: string, agencyId: string, imageBase64: string, mediaType: string) {
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
  return { flat, extractError }
}

// Same policy sent twice? An open (not declined, not itself a duplicate) rate check
// for this phone and line with the same policy number — or, when either side has no
// number, the same carrier and a price within 2%. Two different cars with the same
// carrier and price but different policy numbers are NOT duplicates.
async function findDuplicate(supabase: any, rateCheckId: string, agencyId: string, phone: string, flat: ReturnType<typeof flatten>) {
  const { data } = await supabase
    .from('rate_checks')
    .select('id, status, policy_number, carrier, annual_premium, resubmit_count')
    .eq('agency_id', agencyId)
    .eq('phone', phone)
    .eq('policy_type', flat.policy_type)
    .neq('id', rateCheckId)
    .neq('status', 'declined')
    .is('duplicate_of', null)
    .order('created_at', { ascending: true })
  const norm = (v: unknown) => String(v || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  const pn = norm(flat.policy_number)
  return (data || []).find((o: any) => {
    const on = norm(o.policy_number)
    if (pn && on) return pn === on
    const a = Number(o.annual_premium), b = Number(flat.annual_premium)
    return o.carrier === flat.carrier && a > 0 && b > 0 && Math.abs(a - b) <= Math.max(5, 0.02 * b)
  }) || null
}

// Keep one card: stamp the existing one "sent again" (refreshed with the newer scan
// while nobody has quoted it), and park the new row as a hidden duplicate.
async function foldDuplicate(supabase: any, dup: any, rateCheckId: string, flat: ReturnType<typeof flatten>) {
  const now = new Date().toISOString()
  const stamp = { resubmitted_at: now, resubmit_count: (dup.resubmit_count ?? 0) + 1 }
  if (['pending', 'extracted', 'extract_failed'].includes(dup.status)) {
    const { data: fresh } = await supabase.from('rate_checks')
      .select('extracted, extracted_at, image_path, image_media_type').eq('id', rateCheckId).single()
    await supabase.from('rate_checks').update({
      ...flat, ...stamp, status: 'extracted', extract_error: null,
      extracted: fresh?.extracted ?? null, extracted_at: fresh?.extracted_at ?? now,
      ...(fresh?.image_path ? { image_path: fresh.image_path, image_media_type: fresh.image_media_type } : {}),
    }).eq('id', dup.id)
  } else {
    await supabase.from('rate_checks').update(stamp).eq('id', dup.id)
  }
  await supabase.from('rate_checks').update({ status: 'declined', duplicate_of: dup.id }).eq('id', rateCheckId)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(binary)
}

// Tell the producer who sent the link (email via Resend, if configured). In-app
// notifications are inserted separately; this is for producers away from the app.
async function emailProducer(supabase: any, userId: string, subject: string, text: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return
  const { data: profile } = await supabase.from('profiles').select('email').eq('id', userId).maybeSingle()
  if (!profile?.email) return
  const from = Deno.env.get('RATE_CHECK_EMAIL_FROM') || Deno.env.get('DD_EMAIL_FROM') || 'QuoteSync <noreply@insuredbycam.com>'
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [profile.email], subject, text }),
    })
    if (!r.ok) console.error('[RATE_CHECK] producer email failed:', r.status, await r.text())
  } catch (e) {
    console.error('[RATE_CHECK] producer email error:', (e as Error).message)
  }
}

// Invite by code, only while it's live. Codes are 8 chars from an unambiguous alphabet.
async function resolveInvite(supabase: any, code: unknown) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (c.length !== 8) return null
  const { data } = await supabase
    .from('rate_check_invites')
    .select('id, agency_id, created_by, producer_name, event_name, first_name, phone, expires_at, opened_at, open_count, upload_count')
    .eq('code', c)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return data ?? null
}

// A partner's permanent link (rate_check_promoters), same /r/CODE space as invites.
// It only counts once the partner has signed the current agreement (rate-check-partner).
const PARTNER_AGREEMENT_VERSION = 'partner-v2'
async function resolvePromoter(supabase: any, code: unknown) {
  const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (c.length !== 8) return null
  const { data } = await supabase
    .from('rate_check_promoters')
    .select('id, agency_id, name, photo_url, photo_consent_at')
    .eq('code', c)
    .eq('active', true)
    .eq('agreement_version', PARTNER_AGREEMENT_VERSION)
    .not('agreement_signed_at', 'is', null)
    .maybeSingle()
  return data ?? null
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

  // ── Invite link opened: pre-fill the page. Public, by unguessable code. ──
  if (body?.mode === 'invite_lookup') {
    if (!(await checkRateLimit(supabase, `rate_check_lookup:${clientIp}`, LOOKUP_RATE_LIMIT))) {
      return jsonResponse({ error: 'Rate limit exceeded' }, 429, corsHeaders)
    }
    const invite = await resolveInvite(supabase, body.code)
    if (!invite) {
      // A partner's link: say who shared it, pre-fill nothing.
      const promoter = await resolvePromoter(supabase, body.code)
      if (promoter) {
        return jsonResponse({
          promoter_name: String(promoter.name).trim().split(/\s+/)[0],
          // Only once the partner agreed to show it.
          promoter_photo_url: promoter.photo_consent_at ? promoter.photo_url : null,
        }, 200, corsHeaders)
      }
      return jsonResponse({ error: 'This link has expired' }, 404, corsHeaders)
    }
    await supabase.from('rate_check_invites')
      .update({ opened_at: invite.opened_at ?? new Date().toISOString(), open_count: (invite.open_count ?? 0) + 1 })
      .eq('id', invite.id)
    return jsonResponse({
      first_name: invite.first_name,
      phone: invite.phone,
      event_name: invite.event_name,
      producer_name: invite.producer_name,
    }, 200, corsHeaders)
  }

  // ── Staff upload (Rate Checks inbox): verify the caller and their agency ──
  let staff: { userId: string; agencyId: string; name: string | null } | null = null
  if (body?.mode === 'agent' || body?.mode === 'rescan') {
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
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    staff = { userId: user.id, agencyId: memberships[0].agency_id, name: profile?.full_name ?? null }
  }

  // ── Scan again (staff): re-read the stored image after a failure or a bad read ──
  if (body?.mode === 'rescan') {
    if (!staff) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
    const { data: rc } = await supabase
      .from('rate_checks')
      .select('id, agency_id, lead_id, image_path, image_media_type, status')
      .eq('id', String(body.rate_check_id || ''))
      .eq('agency_id', staff.agencyId)
      .maybeSingle()
    if (!rc) return jsonResponse({ error: 'Rate check not found' }, 404, corsHeaders)
    if (!rc.image_path) return jsonResponse({ error: 'No photo on file to scan' }, 409, corsHeaders)
    if (['won', 'lost', 'bound', 'declined'].includes(rc.status)) return jsonResponse({ error: 'This rate check is already closed' }, 409, corsHeaders)
    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(rc.image_path)
    if (dlErr || !file) return jsonResponse({ error: 'Couldn’t read the stored photo' }, 500, corsHeaders)
    const base64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()))
    const { flat, extractError } = await extractAndStore(supabase, anthropicKey, rc.id, rc.agency_id, base64, rc.image_media_type)
    if (flat && rc.lead_id) {
      await supabase.from('leads').update({ ...leadFieldsFor(flat.policy_type, flat.carrier, flat.annual_premium), vehicle_count: flat.vehicle_count }).eq('id', rc.lead_id)
    }
    await audit(supabase, {
      event_type: flat ? 'RATE_CHECK_EXTRACTED' : 'RATE_CHECK_FAILED',
      agency_id: rc.agency_id, lead_id: rc.lead_id, actor_user_id: staff.userId,
      metadata: { rate_check_id: rc.id, rescan: true, carrier: flat?.carrier ?? null, ...(extractError ? { error: extractError.slice(0, 300) } : {}) },
    })
    return jsonResponse({ status: flat ? 'extracted' : 'extract_failed', error: extractError, carrier: flat?.carrier ?? null, policy_type: flat?.policy_type ?? null, annual_premium: flat?.annual_premium ?? null }, 200, corsHeaders)
  }

  // ── Tagged invite link (consumer upload from /r/CODE) ──
  const invite = !staff && body.invite_code ? await resolveInvite(supabase, body.invite_code) : null
  // Not a producer's invite? It may be a partner's link (paid per qualified household).
  const promoter = !staff && !invite && body.invite_code ? await resolvePromoter(supabase, body.invite_code) : null

  // No cap on how many policies one household sends: once a visitor's first policy is in,
  // the rest of their policies (same browser session, phone and network, within 30 minutes)
  // count against a separate, larger per-session allowance instead of the per-IP limit.
  const householdKey = !staff ? await householdFollowUpKey(supabase, body, clientIp) : null
  const limited = staff
    ? !(await checkRateLimit(supabase, `rate_check_agent:${staff.userId}`, AGENT_RATE_LIMIT))
    : householdKey
      ? !(await checkRateLimit(supabase, householdKey, HOUSEHOLD_RATE_LIMIT))
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

  const email = (cleanText(body.email, 160) || '').trim().toLowerCase() || null

  const errors: string[] = []
  if (phone.length !== 10) errors.push('phone must be a 10-digit US number')
  // The form requires an email; the function only checks the shape (an older form may not send one).
  if (email && !EMAIL_RE.test(email)) errors.push('email is not valid')
  // ZIP is optional for staff uploads (an emailed dec page may not need it typed in).
  if (staff ? (zip && !/^\d{5}$/.test(zip)) : !/^\d{5}$/.test(zip)) errors.push('zip must be 5 digits')
  if (!staff && (!body.consent_given_at || Number.isNaN(Date.parse(body.consent_given_at)))) {
    errors.push('consent_given_at is required')
  }
  if (!staff && !['own', 'rent', 'family', 'retirement'].includes(String(body.housing_situation || ''))) errors.push('housing_situation is required')
  if (!MEDIA_TYPES[mediaType]) errors.push('media_type not allowed')
  if (!imageBase64) errors.push('image_base64 is required')
  else if (base64DecodedSize(imageBase64) > MAX_IMAGE_BYTES) errors.push('image exceeds 10 MB')
  if (errors.length) {
    return jsonResponse({ error: errors.join('; ') }, 400, corsHeaders)
  }

  const firstName = cleanText(body.first_name, 80)
  // Where they live (asked on the form; optional on staff uploads). Drives rules and the lead.
  const HOUSING = ['own', 'rent', 'family', 'retirement']
  const housing = HOUSING.includes(String(body.housing_situation || '')) ? String(body.housing_situation) : null
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

  // ── Consumer uploads need a verified mobile number (rate-check-otp) this session ──
  if (!staff && OTP_REQUIRED) {
    const { data: verified } = await supabase
      .from('rate_check_otps')
      .select('id')
      .eq('phone', phone)
      .eq('session_id', sessionId)
      .not('verified_at', 'is', null)
      .gte('verified_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(1)
    if (!verified?.length) return jsonResponse({ error: 'Verify your mobile number first.', code: 'phone_unverified' }, 403, corsHeaders)
  }
  const landingPage = staff ? 'agent_upload' : cleanText(body.landing_page, 512)
  // Who gets credit: the producer who sent the link, or the staff member uploading.
  const origin = invite
    ? { invite_id: invite.id, producer_id: invite.created_by, producer_name: invite.producer_name, event_name: invite.event_name }
    : staff
      ? { producer_id: staff.userId, producer_name: staff.name }
      : {}

  try {
    // ── Resolve agency ──
    // routing: rate checks currently all land on the default agency. When
    // multi-agency Rate Check ships, route here (e.g. by landing domain or
    // routing_rules state/zip, like create-lead's routeLead) before inserting.
    // Staff uploads go to the uploader's own agency; invite uploads to the inviter's.
    const { data: defaultAgency } = staff
      ? { data: { id: staff.agencyId } }
      : invite
        ? { data: { id: invite.agency_id } }
        : promoter
          ? { data: { id: promoter.agency_id } }
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
        email,
        zip: zip || null,
        upload_source: staff ? 'agent' : 'consumer',
        uploaded_by: staff?.userId ?? null,
        housing_situation: housing,
        ...origin,
        ...(promoter ? { promoter_id: promoter.id } : {}),
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
    const { flat, extractError } = await extractAndStore(supabase, anthropicKey, rateCheckId, agencyId, imageBase64, mediaType)

    // ── 3b. Same policy sent twice → one card ──
    const duplicate = flat ? await findDuplicate(supabase, rateCheckId, agencyId, phone, flat) : null
    if (duplicate) await foldDuplicate(supabase, duplicate, rateCheckId, flat!)

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
        ...(duplicate ? { duplicate_of: duplicate.id } : {}),
        ...(extractError ? { error: extractError.slice(0, 300) } : {}),
      },
    })

    // ── 4. Lead (direct insert/update — no SMS/Bland automation) ──
    let leadId: string | null = null
    try {
      const policyFields = flat ? leadFieldsFor(policyType, carrier, annualPremium) : {}
      if (flat) policyFields.vehicle_count = flat.vehicle_count
      // What the customer told us about where they live beats what the policy implies.
      if (housing) {
        policyFields.housing_situation = housing
        policyFields.owns_home = housing === 'own'
      }

      const { data: existingLeads } = await supabase
        .from('leads')
        .select('id, status, assigned_to_id')
        .eq('agency_id', agencyId)
        .eq('phone', phone)
        .not('status', 'in', '(closed_won,closed_lost)')
        .order('created_at', { ascending: false })
        .limit(1)
      // Sent here from the /save wizard (same tab, same session_id): join the partial lead
      // it started, which may not have a phone yet, rather than creating a second lead.
      let existing = existingLeads?.[0]
      if (!existing && !staff) {
        const { data: sessionLeads } = await supabase
          .from('leads')
          .select('id, status, assigned_to_id')
          .eq('agency_id', agencyId)
          .eq('session_id', sessionId)
          .eq('status', 'partial')
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
        existing = sessionLeads?.[0]
      }

      if (existing) {
        const { error } = await supabase
          .from('leads')
          .update({
            ...(firstName ? { first_name: firstName } : {}),
            ...(phone ? { phone } : {}),
            ...(email ? { email } : {}),
            ...(zip ? { zip } : {}),
            ...consent,
            ...policyFields,
            ...(existing.status === 'partial' ? { status: 'new' } : {}),
            // The producer who sourced it works it — unless someone already owns the lead.
            ...(origin.producer_id && !existing.assigned_to_id ? { assigned_to_id: origin.producer_id } : {}),
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
            email,
            ...consent,
            ...sanitizedUtm,
            landing_page: landingPage,
            session_id: sessionId,
            ...(origin.producer_id ? { assigned_to_id: origin.producer_id } : {}),
            ...(flat ? policyFields : { product_intent: 'bundle', ...(housing ? { housing_situation: housing, owns_home: housing === 'own' } : {}) }),
          })
          .select('id')
          .single()
        if (error) throw error
        leadId = lead.id
      }

      await supabase.from('rate_checks').update({ lead_id: leadId }).eq('id', rateCheckId)
      if (duplicate) await supabase.from('rate_checks').update({ lead_id: leadId }).eq('id', duplicate.id).is('lead_id', null)
      await supabase.from('audit_log').update({ lead_id: leadId })
        .eq('agency_id', agencyId)
        .in('event_type', ['RATE_CHECK_RECEIVED', 'RATE_CHECK_EXTRACTED', 'RATE_CHECK_FAILED'])
        .eq('metadata->>rate_check_id', rateCheckId)
    } catch (e) {
      // The rate_checks row still holds contact + consent; the agent can work it from the inbox.
      console.error('[RATE_CHECK] Lead create/update failed:', (e as Error).message)
    }

    // ── 4b. Credit the invite and tell the producer who sent it ──
    if (invite && !duplicate) {
      await supabase.from('rate_check_invites')
        .update({ upload_count: (invite.upload_count ?? 0) + 1, last_rate_check_id: rateCheckId })
        .eq('id', invite.id)
      const premiumText = annualPremium != null ? `$${Math.round(annualPremium).toLocaleString('en-US')}/yr` : 'price not read'
      await supabase.from('notifications').insert({
        user_id: invite.created_by,
        type: 'RATE_CHECK_INVITE_UPLOAD',
        title: `${firstName || 'Your invite'} uploaded a policy`,
        message: `${firstName || 'Someone'}${invite.event_name ? ` from ${invite.event_name}` : ''} · ${carrier || 'Unknown carrier'} ${policyType || 'policy'} · ${premiumText}`,
        metadata: { rate_check_id: rateCheckId, lead_id: leadId, invite_id: invite.id, event_name: invite.event_name },
      })
      const appUrl = Deno.env.get('QUOTESYNC_APP_URL') || 'https://quotesync.vercel.app'
      await emailProducer(supabase, invite.created_by,
        `${firstName || 'Your invite'} uploaded their policy${invite.event_name ? ` (${invite.event_name})` : ''}`,
        `${firstName || 'Someone'} just uploaded a ${carrier || 'policy'}${policyType ? ` ${policyType}` : ''} policy${annualPremium != null ? ` paying $${Math.round(annualPremium).toLocaleString('en-US')}/yr` : ''}.\n\n` +
        `Open it: ${appUrl}/agency/leads/rate-checks\n\nThe page told them we typically text within 30 minutes during business hours.`)
    }

    // ── 5. Notify agency staff (in-app) ──
    const { data: members } = await supabase
      .from('agency_memberships')
      .select('user_id')
      .eq('agency_id', agencyId)
      .eq('status', 'active')
      .in('agency_role', ['owner', 'principal', 'manager', 'producer'])

    // The uploading agent is already working a staff upload — only notify for consumer uploads.
    if (!staff && !duplicate && members && members.length > 0) {
      const premiumText = annualPremium != null ? `$${Math.round(annualPremium).toLocaleString('en-US')}/yr` : '$?/yr'
      const message = `${firstName || 'Someone'} · ${carrier || 'Unknown carrier'} ${policyType || 'policy'} · ${premiumText} · ${zip}`
      const uniqueUsers = [...new Set(members.map((m: any) => m.user_id))].filter(u => u !== invite?.created_by)
      if (uniqueUsers.length) await supabase.from('notifications').insert(uniqueUsers.map(userId => ({
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
