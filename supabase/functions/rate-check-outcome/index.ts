// Supabase Edge Function: rate-check-outcome
// POST /functions/v1/rate-check-outcome   (verify_jwt = true — agents only)
// Body: { rate_check_id, allstate_premium, quote_note? }
//
// Records the agent's Allstate quote on a rate check. The rate_checks trigger
// computes delta / delta_pct and flips status to won or lost; this function then
// moves the linked lead:
//   won  → lead 'interested' + a case note with the savings, delta returned for the call script
//   lost → lead 'closed_lost' + a polite auto-text via send-manual-sms (if not opted out
//          and the agency has a Twilio number)

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

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const money = (n: number | null | undefined) =>
  n == null ? '?' : Math.round(Number(n)).toLocaleString('en-US')

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || serviceKey
  const authHeader = req.headers.get('Authorization') || ''

  // User-scoped client: RLS + get_user_agency_ids() run as the caller.
  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  // Service role for lead / case-note / audit writes after the agency check.
  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    const body = await req.json().catch(() => ({}))
    const rateCheckId = body.rate_check_id
    const allstatePremium = Number(body.allstate_premium)
    const quoteNote = body.quote_note ? String(body.quote_note).slice(0, 2000) : null

    if (!rateCheckId || !Number.isFinite(allstatePremium) || allstatePremium <= 0) {
      return jsonResponse({ error: 'rate_check_id and a positive allstate_premium are required' }, 400, corsHeaders)
    }

    // Load with service role, then confirm the caller belongs to that agency.
    const { data: existing } = await supabase
      .from('rate_checks')
      .select('id, agency_id, status')
      .eq('id', rateCheckId)
      .single()
    if (!existing) {
      return jsonResponse({ error: 'Rate check not found' }, 404, corsHeaders)
    }

    const { data: agencyIds, error: agErr } = await supabaseUser.rpc('get_user_agency_ids')
    if (agErr) throw agErr
    const allowed = (agencyIds || []).map((r: any) => (typeof r === 'string' ? r : r?.get_user_agency_ids ?? r))
    if (!allowed.includes(existing.agency_id)) {
      return jsonResponse({ error: 'Access denied' }, 403, corsHeaders)
    }
    if (existing.status === 'declined') {
      return jsonResponse({ error: 'Rate check was declined and is closed' }, 409, corsHeaders)
    }

    // Update as the caller (RLS-checked); the trigger sets status/quoted_at/outcome_at.
    const { data: rc, error: updErr } = await supabaseUser
      .from('rate_checks')
      .update({ allstate_premium: allstatePremium, quote_note: quoteNote, quoted_by: user.id })
      .eq('id', rateCheckId)
      .select('id, agency_id, lead_id, first_name, carrier, policy_type, annual_premium, allstate_premium, delta, delta_pct, status')
      .single()
    if (updErr) throw updErr

    const result: Record<string, unknown> = {
      rate_check_id: rc.id,
      status: rc.status,
      annual_premium: rc.annual_premium,
      allstate_premium: rc.allstate_premium,
      delta: rc.delta,
      delta_pct: rc.delta_pct,
      first_name: rc.first_name,
      carrier: rc.carrier,
      policy_type: rc.policy_type,
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    if (rc.status === 'won' && rc.lead_id) {
      await supabase.from('leads').update({ status: 'interested' }).eq('id', rc.lead_id)
      const { error: noteErr } = await supabase.from('case_notes').insert({
        agency_id: rc.agency_id,
        case_type: 'lead',
        case_id: rc.lead_id,
        customer_name: rc.first_name,
        note_type: 'general',
        tags: ['rate_check'],
        body: `Rate check WON: ${rc.carrier || 'Current carrier'} $${money(rc.annual_premium)} → Allstate $${money(rc.allstate_premium)} (save $${money(rc.delta)}, ${rc.delta_pct ?? '?'}%)` +
          (quoteNote ? `\n${quoteNote}` : ''),
        author_id: user.id,
        author_name: profile?.full_name || user.email || null,
      })
      if (noteErr) console.error('[RATE_CHECK_OUTCOME] case note failed:', noteErr.message)
    }

    if (rc.status === 'lost' && rc.lead_id) {
      await supabase
        .from('leads')
        .update({ status: 'closed_lost', disposition_reason: 'other', disposition_note: 'rate_check_lost' })
        .eq('id', rc.lead_id)

      const [{ data: lead }, { data: agency }] = await Promise.all([
        supabase.from('leads').select('sms_opted_out, phone').eq('id', rc.lead_id).single(),
        supabase.from('agencies').select('twilio_from_number').eq('id', rc.agency_id).single(),
      ])

      let sms: Record<string, unknown>
      if (lead?.sms_opted_out) {
        sms = { attempted: false, reason: 'sms_opted_out' }
      } else if (!agency?.twilio_from_number) {
        sms = { attempted: false, reason: 'agency has no twilio_from_number' }
      } else if (!lead?.phone) {
        sms = { attempted: false, reason: 'lead has no phone' }
      } else {
        const smsBody =
          `Hi ${rc.first_name || 'there'}, this is Cam Wiley's office. We checked your ${rc.carrier || 'current'} policy ` +
          `and you're in good shape — we couldn't beat it today. We'll reach out if that changes. Reply STOP to opt out.`
        try {
          // Forward the agent's JWT so send-manual-sms runs its own membership check.
          const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: anonKey },
            body: JSON.stringify({ lead_id: rc.lead_id, body: smsBody }),
          })
          const smsJson = await smsRes.json().catch(() => ({}))
          sms = { attempted: true, ok: smsRes.ok, status: smsRes.status, ...(smsRes.ok ? {} : { error: smsJson.error }) }
          if (!smsRes.ok) console.error('[RATE_CHECK_OUTCOME] lost-path SMS failed:', smsRes.status, smsJson.error)
        } catch (e) {
          sms = { attempted: true, ok: false, error: (e as Error).message }
          console.error('[RATE_CHECK_OUTCOME] lost-path SMS error:', (e as Error).message)
        }
      }
      if (!sms.attempted) console.log('[RATE_CHECK_OUTCOME] lost-path SMS skipped:', sms.reason)
      result.sms = sms
    }

    await supabase.from('audit_log').insert({
      event_type: 'RATE_CHECK_QUOTED',
      lead_id: rc.lead_id,
      agency_id: rc.agency_id,
      actor_user_id: user.id,
      metadata: {
        rate_check_id: rc.id,
        status: rc.status,
        annual_premium: rc.annual_premium,
        allstate_premium: rc.allstate_premium,
        delta: rc.delta,
        sms: result.sms ?? null,
      },
    })

    return jsonResponse(result, 200, corsHeaders)
  } catch (error) {
    console.error('[RATE_CHECK_OUTCOME] Error:', error)
    return jsonResponse({ error: (error as Error).message || 'Internal server error' }, 500, corsHeaders)
  }
})
