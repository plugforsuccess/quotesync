// Supabase Edge Function: parse-declaration-pdf
// POST /functions/v1/parse-declaration-pdf
// Downloads a lead's uploaded declarations page from storage, sends it to Claude
// for structured extraction, and writes the parsed fields onto the lead record.
//
// Secrets (set as Supabase Function secrets, NOT VITE_ vars):
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

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

const ANTHROPIC_MODEL = 'claude-opus-4-8'
const BUCKET = 'lead-declarations'

// Forced-tool schema: a single tool the model must call, whose validated input
// is the structured declarations data. Every field nullable — dec pages vary
// wildly by carrier and some won't be present.
const EXTRACTION_TOOL = {
  name: 'record_declaration',
  description:
    'Record the structured data extracted from an insurance declarations (dec) page.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      policy_type: {
        type: ['string', 'null'],
        enum: ['auto', 'home', 'renters', 'condo', 'umbrella', 'other', null],
        description: 'Line of business this dec page covers.',
      },
      insurer: { type: ['string', 'null'], description: 'Carrier / insurance company name.' },
      policy_number: { type: ['string', 'null'] },
      named_insured: { type: ['string', 'null'], description: 'Primary policyholder name.' },
      mailing_address: { type: ['string', 'null'] },
      effective_date: { type: ['string', 'null'], description: 'Policy effective date, ISO YYYY-MM-DD if determinable.' },
      expiration_date: { type: ['string', 'null'], description: 'Policy expiration/renewal date, ISO YYYY-MM-DD if determinable.' },
      annual_premium: { type: ['number', 'null'], description: 'Total annual premium in USD. Annualize if billed per-term.' },
      vehicles: {
        type: 'array',
        description: 'Vehicles listed on the policy (auto only). Empty if none.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            year: { type: ['integer', 'null'] },
            make: { type: ['string', 'null'] },
            model: { type: ['string', 'null'] },
            vin: { type: ['string', 'null'] },
          },
          required: ['year', 'make', 'model', 'vin'],
        },
      },
      drivers: {
        type: 'array',
        description: 'Drivers listed on the policy. Empty if none.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: ['string', 'null'] },
            date_of_birth: { type: ['string', 'null'] },
          },
          required: ['name', 'date_of_birth'],
        },
      },
      coverages: {
        type: 'array',
        description: 'Coverage lines (e.g. bodily injury, dwelling, deductible).',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: ['string', 'null'], description: 'Coverage name, e.g. "Bodily Injury", "Dwelling".' },
            limit: { type: ['string', 'null'], description: 'Coverage limit as shown, e.g. "100/300", "$250,000".' },
            deductible: { type: ['string', 'null'] },
          },
          required: ['type', 'limit', 'deductible'],
        },
      },
      confidence: {
        type: ['string', 'null'],
        enum: ['high', 'medium', 'low', null],
        description: 'Your overall confidence in this extraction. Use "low" for blurry/partial/illegible documents.',
      },
      notes: { type: ['string', 'null'], description: 'Anything ambiguous or worth a human double-check.' },
    },
    required: [
      'policy_type', 'insurer', 'policy_number', 'named_insured', 'mailing_address',
      'effective_date', 'expiration_date', 'annual_premium', 'vehicles', 'drivers',
      'coverages', 'confidence', 'notes',
    ],
  },
}

const SYSTEM_PROMPT =
  'You are an insurance back-office assistant. You are given a customer\'s current ' +
  'insurance declarations ("dec") page as a document. Extract the fields exactly as ' +
  'shown — do not guess values that are not present; use null for anything missing, ' +
  'illegible, or not applicable. Normalize dates to ISO YYYY-MM-DD only when you are ' +
  'confident of the value. Always respond by calling the record_declaration tool.'

async function arrayBufferToBase64(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
  const supabase = createClient(supabaseUrl, serviceKey)

  let leadId: string | null = null
  let storagePath: string | null = null

  try {
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY is not configured')

    const body = await req.json()
    leadId = body.lead_id
    storagePath = body.storage_path

    if (!leadId || !storagePath) throw new Error('lead_id and storage_path are required')
    // Defense in depth: the file must live under this lead's own folder.
    if (!storagePath.startsWith(`${leadId}/`)) {
      throw new Error('storage_path must be within the lead folder')
    }

    // Confirm the lead exists (and grab agency for the audit trail).
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, agency_id')
      .eq('id', leadId)
      .single()
    if (leadErr || !lead) throw new Error('Lead not found')

    // Download the uploaded document (service role bypasses storage RLS).
    const { data: file, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath)
    if (dlErr || !file) throw new Error(`Could not download document: ${dlErr?.message || 'missing'}`)

    const mediaType = file.type || 'application/pdf'
    const base64 = await arrayBufferToBase64(await file.arrayBuffer())
    const isPdf = mediaType === 'application/pdf'

    // PDFs go in a `document` block; phone photos go in an `image` block.
    const documentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools: [EXTRACTION_TOOL],
        tool_choice: { type: 'tool', name: 'record_declaration' },
        messages: [
          {
            role: 'user',
            content: [
              documentBlock,
              { type: 'text', text: 'Extract the declarations data from this document.' },
            ],
          },
        ],
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic API error (${anthropicRes.status}): ${errText.slice(0, 500)}`)
    }

    const result = await anthropicRes.json()
    const toolUse = (result.content || []).find(
      (b: any) => b.type === 'tool_use' && b.name === 'record_declaration'
    )
    if (!toolUse?.input) throw new Error('Model did not return structured declaration data')

    const declarationData = {
      ...toolUse.input,
      _meta: {
        model: ANTHROPIC_MODEL,
        parsed_at: new Date().toISOString(),
        source_media_type: mediaType,
        usage: result.usage ?? null,
      },
    }

    const { error: updErr } = await supabase
      .from('leads')
      .update({
        declaration_data: declarationData,
        declaration_pdf_path: storagePath,
        declaration_parse_status: 'parsed',
        declaration_parsed_at: new Date().toISOString(),
      })
      .eq('id', leadId)
    if (updErr) throw updErr

    await supabase.from('audit_log').insert({
      event_type: 'DECLARATION_PARSED',
      lead_id: leadId,
      agency_id: lead.agency_id,
      metadata: {
        policy_type: toolUse.input.policy_type ?? null,
        insurer: toolUse.input.insurer ?? null,
        confidence: toolUse.input.confidence ?? null,
        media_type: mediaType,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: leadId,
        declaration: toolUse.input,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Declaration parse error:', error)

    // Best-effort: record the failure on the lead so the UI can show "needs review"
    // and the agent still has the original PDF to read manually.
    if (leadId) {
      await supabase
        .from('leads')
        .update({
          declaration_pdf_path: storagePath,
          declaration_parse_status: 'failed',
        })
        .eq('id', leadId)
        .then(undefined, () => {})
    }

    return new Response(
      JSON.stringify({ error: (error as Error).message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
