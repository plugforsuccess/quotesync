// Supabase Edge Function: rate-check-outcome
// POST /functions/v1/rate-check-outcome   (verify_jwt = true — agents only)
// Body: { rate_check_id, allstate_premium, quote_note? }
//   or  { action: 'bound', rate_check_id, bound_carrier, bound_premium? }  → status 'bound', lead closed_won,
//        plus (once per household, with texting consent) a thank-you text with the agency's
//        Google review link. Asked of every bound customer; nothing is offered for it.
//
// Records the agent's Allstate quote on a rate check. The rate_checks trigger
// computes delta / delta_pct and flips status to won or lost; this function then
// moves the linked lead:
//   won  → lead 'interested' + a case note with the savings, delta returned for the call script,
//          and (once per household, with texting consent) a "your quote is ready, reply Y
//          for a call" text; the Y reply sets rate_checks.call_confirmed_at
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

// audit_log.event_type is allowlisted (see the *_audit_log_rate_check_events
// migration); log instead of failing silently if an insert is rejected.
async function audit(supabase: any, row: Record<string, unknown>) {
  const { error } = await supabase.from('audit_log').insert(row)
  if (error) console.error('[RATE_CHECK_OUTCOME] audit insert failed:', row.event_type, error.message)
}

// The texts are edited by the owner in Rate Checks → Texts (site_copy keys
// `${key}.1`, `${key}.2`, …). These defaults match src/lib/textTemplates.js.
const TEXTS: Record<string, string[]> = {
  'sms.quote.ready': [
    "Hi [first name], it's Cam Wiley's office. Your Allstate quote is ready and it looks like we can save you money.",
    "Reply Y and we'll call you to go over it.",
  ],
  'sms.quote.lost': [
    "Hi [first name], this is Cam Wiley's office. We checked your [carrier] policy and you're in good shape: we couldn't beat it today.",
    "We'll reach out if that changes.",
  ],
  'sms.review.customer': [
    "Hi [first name], it's Cam with Cam Wiley Agency. Thank you for trusting us with your insurance!",
    'If you have a minute, an honest Google review helps other Georgia families find us: [review link]',
    'Questions about your policy? Just reply here.',
  ],
}

/** The saved text with blanks filled in; always ends with the opt-out line. */
async function textFor(supabase: any, key: string, vars: { name?: string | null, carrier?: string | null, reviewLink?: string }) {
  const defaults = TEXTS[key]
  const keys = defaults.map((_, i) => `${key}.${i + 1}`)
  const { data: saved } = await supabase.from('site_copy').select('key, value').in('key', keys)
  const byKey = Object.fromEntries((saved || []).map((r: any) => [r.key, r.value]))
  const first = String(vars.name || '').trim().split(/\s+/)[0] || 'there'
  let body = defaults.map((d, i) => (typeof byKey[keys[i]] === 'string' && byKey[keys[i]].trim()) ? byKey[keys[i]] : d)
    .filter(t => t.trim()).join('\n\n')
    .replace(/\[first name\]/gi, first)
    .replace(/\[carrier\]/gi, vars.carrier || 'current')
    .replace(/\[review link\]/gi, vars.reviewLink || '')
  if (vars.reviewLink && !body.includes(vars.reviewLink)) body += `\n\n${vars.reviewLink}`
  if (!/\bSTOP\b/.test(body)) body += '\n\nReply STOP to opt out.'
  return body
}

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
    const isBind = body.action === 'bound'
    const allstatePremium = Number(body.allstate_premium)
    const quoteNote = body.quote_note ? String(body.quote_note).slice(0, 2000) : null
    const boundCarrier = isBind ? String(body.bound_carrier || 'Allstate').slice(0, 80) : null
    const boundPremium = isBind && body.bound_premium != null && Number.isFinite(Number(body.bound_premium)) ? Number(body.bound_premium) : null

    if (!rateCheckId || (!isBind && (!Number.isFinite(allstatePremium) || allstatePremium <= 0))) {
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    // ── Bound: the policy was written. Terminal; closes the lead as won. ──
    if (isBind) {
      if (!['won', 'quoted', 'lost', 'extracted', 'extract_failed'].includes(existing.status)) {
        return jsonResponse({ error: `Can’t bind a rate check that is ${existing.status}` }, 409, corsHeaders)
      }
      const { data: b, error: bErr } = await supabaseUser
        .from('rate_checks')
        .update({ status: 'bound', bound_carrier: boundCarrier, bound_premium: boundPremium, bound_at: new Date().toISOString(), bound_by: user.id })
        .eq('id', rateCheckId)
        .select('id, agency_id, lead_id, first_name, phone, carrier, annual_premium, bound_carrier, bound_premium, status, consent_given_at')
        .single()
      if (bErr) throw bErr
      if (b.lead_id) {
        await supabase.from('leads').update({ status: 'closed_won' }).eq('id', b.lead_id)
        const { error: noteErr } = await supabase.from('case_notes').insert({
          agency_id: b.agency_id, case_type: 'lead', case_id: b.lead_id, customer_name: b.first_name,
          note_type: 'general', tags: ['rate_check', 'bound'],
          body: `Rate check BOUND with ${b.bound_carrier}${b.bound_premium != null ? ` at $${money(b.bound_premium)}/yr` : ''} (was ${b.carrier || 'current carrier'} $${money(b.annual_premium)})`,
          author_id: user.id, author_name: profile?.full_name || user.email || null,
        })
        if (noteErr) console.error('[RATE_CHECK_OUTCOME] bound note failed:', noteErr.message)
      }
      await audit(supabase, {
        event_type: 'RATE_CHECK_QUOTED', lead_id: b.lead_id, agency_id: b.agency_id, actor_user_id: user.id,
        metadata: { rate_check_id: b.id, status: 'bound', bound_carrier: b.bound_carrier, bound_premium: b.bound_premium },
      })
      // Thank-you + Google review ask, sent the moment it's bound. Same guards as the
      // other automatic texts; once per household (any rate check with this phone).
      let review: Record<string, unknown>
      const [{ data: askedAlready }, { data: lead }, { data: agency }] = await Promise.all([
        supabase.from('rate_checks').select('id').eq('agency_id', b.agency_id).eq('phone', b.phone)
          .not('review_requested_at', 'is', null).limit(1),
        b.lead_id ? supabase.from('leads').select('sms_opted_out, phone').eq('id', b.lead_id).single() : Promise.resolve({ data: null }),
        supabase.from('agencies').select('twilio_from_number, google_review_url').eq('id', b.agency_id).single(),
      ])
      // The link: the agency's column, else the one pasted in the copy editor.
      const { data: linkRow } = await supabase.from('site_copy').select('value').eq('key', 'link.google_review').maybeSingle()
      const pasted = String(linkRow?.value || '').trim()
      const reviewLink = agency?.google_review_url || (/^https:\/\/\S+$/.test(pasted) ? pasted : '')
      if (!b.lead_id) review = { attempted: false, reason: 'no lead to text' }
      else if (askedAlready && askedAlready.length > 0) review = { attempted: false, reason: 'household already asked' }
      else if (!b.consent_given_at) review = { attempted: false, reason: 'no texting consent on file' }
      else if (lead?.sms_opted_out) review = { attempted: false, reason: 'sms_opted_out' }
      else if (!agency?.twilio_from_number) review = { attempted: false, reason: 'agency has no twilio_from_number' }
      else if (!reviewLink) review = { attempted: false, reason: 'no Google review link set' }
      else if (!lead?.phone) review = { attempted: false, reason: 'lead has no phone' }
      else {
        const reviewBody = await textFor(supabase, 'sms.review.customer', { name: b.first_name, reviewLink })
        try {
          const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: anonKey },
            body: JSON.stringify({ lead_id: b.lead_id, body: reviewBody }),
          })
          const smsJson = await smsRes.json().catch(() => ({}))
          review = { attempted: true, ok: smsRes.ok, status: smsRes.status, ...(smsRes.ok ? {} : { error: smsJson.error }) }
          if (smsRes.ok) await supabase.from('rate_checks').update({ review_requested_at: new Date().toISOString() }).eq('id', b.id)
          else console.error('[RATE_CHECK_OUTCOME] review SMS failed:', smsRes.status, smsJson.error)
        } catch (e) {
          review = { attempted: true, ok: false, error: (e as Error).message }
          console.error('[RATE_CHECK_OUTCOME] review SMS error:', (e as Error).message)
        }
      }
      if (!review.attempted) console.log('[RATE_CHECK_OUTCOME] review SMS skipped:', review.reason)
      return jsonResponse({ rate_check_id: b.id, status: 'bound', bound_carrier: b.bound_carrier, bound_premium: b.bound_premium, review }, 200, corsHeaders)
    }

    // Update as the caller (RLS-checked); the trigger sets status/quoted_at/outcome_at.
    const { data: rc, error: updErr } = await supabaseUser
      .from('rate_checks')
      .update({ allstate_premium: allstatePremium, quote_note: quoteNote, quoted_by: user.id })
      .eq('id', rateCheckId)
      .select('id, agency_id, lead_id, first_name, phone, carrier, policy_type, annual_premium, allstate_premium, delta, delta_pct, status, consent_given_at')
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

      // Quote ready: text the customer once per household, asking them to reply Y for a
      // call. Their Y (twilio-sms-inbound) sets call_confirmed_at, which is what makes a
      // partner-referred household payable when the agency requires it.
      const { data: textedAlready } = await supabase
        .from('rate_checks').select('id').eq('agency_id', rc.agency_id).eq('phone', rc.phone)
        .not('quote_ready_texted_at', 'is', null).limit(1)
      const [{ data: lead }, { data: agency }] = await Promise.all([
        supabase.from('leads').select('sms_opted_out, phone').eq('id', rc.lead_id).single(),
        supabase.from('agencies').select('twilio_from_number').eq('id', rc.agency_id).single(),
      ])
      let readySms: Record<string, unknown>
      if (textedAlready && textedAlready.length > 0) readySms = { attempted: false, reason: 'household already texted' }
      else if (!rc.consent_given_at) readySms = { attempted: false, reason: 'no texting consent on file (agent-uploaded rate check)' }
      else if (lead?.sms_opted_out) readySms = { attempted: false, reason: 'sms_opted_out' }
      else if (!agency?.twilio_from_number) readySms = { attempted: false, reason: 'agency has no twilio_from_number' }
      else if (!lead?.phone) readySms = { attempted: false, reason: 'lead has no phone' }
      else {
        const readyBody = await textFor(supabase, 'sms.quote.ready', { name: rc.first_name })
        try {
          const smsRes = await fetch(`${supabaseUrl}/functions/v1/send-manual-sms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader, apikey: anonKey },
            body: JSON.stringify({ lead_id: rc.lead_id, body: readyBody }),
          })
          const smsJson = await smsRes.json().catch(() => ({}))
          readySms = { attempted: true, ok: smsRes.ok, status: smsRes.status, ...(smsRes.ok ? {} : { error: smsJson.error }) }
          if (smsRes.ok) {
            await supabase.from('rate_checks').update({ quote_ready_texted_at: new Date().toISOString() }).eq('id', rc.id)
          } else console.error('[RATE_CHECK_OUTCOME] quote-ready SMS failed:', smsRes.status, smsJson.error)
        } catch (e) {
          readySms = { attempted: true, ok: false, error: (e as Error).message }
          console.error('[RATE_CHECK_OUTCOME] quote-ready SMS error:', (e as Error).message)
        }
      }
      if (!readySms.attempted) console.log('[RATE_CHECK_OUTCOME] quote-ready SMS skipped:', readySms.reason)
      result.sms = readySms
    }

    if (rc.status === 'lost' && rc.lead_id) {
      // Household: if this person has another policy we won or haven't quoted yet,
      // don't close the lead or send the "couldn't beat it" text — the bundle may still win.
      const { data: siblings } = await supabase
        .from('rate_checks')
        .select('id, status')
        .eq('agency_id', rc.agency_id)
        .eq('phone', rc.phone)
        .neq('id', rc.id)
        .in('status', ['pending', 'extracted', 'extract_failed', 'quoted', 'won', 'bound'])
      if (siblings && siblings.length > 0) {
        result.sms = { attempted: false, reason: `household has ${siblings.length} other open or won polic${siblings.length === 1 ? 'y' : 'ies'} — no text sent, lead left open` }
        result.household_open = siblings.length
        await audit(supabase, {
          event_type: 'RATE_CHECK_QUOTED', lead_id: rc.lead_id, agency_id: rc.agency_id, actor_user_id: user.id,
          metadata: { rate_check_id: rc.id, status: rc.status, annual_premium: rc.annual_premium, allstate_premium: rc.allstate_premium, delta: rc.delta, sms: result.sms },
        })
        return jsonResponse(result, 200, corsHeaders)
      }

      await supabase
        .from('leads')
        .update({ status: 'closed_lost', disposition_reason: 'other', disposition_note: 'rate_check_lost' })
        .eq('id', rc.lead_id)

      const [{ data: lead }, { data: agency }] = await Promise.all([
        supabase.from('leads').select('sms_opted_out, phone').eq('id', rc.lead_id).single(),
        supabase.from('agencies').select('twilio_from_number').eq('id', rc.agency_id).single(),
      ])

      let sms: Record<string, unknown>
      // TCPA: only text customers who consented on the Rate Check page. Dec pages an
      // agent uploaded on a customer's behalf carry no consent, so they're never auto-texted.
      if (!rc.consent_given_at) {
        sms = { attempted: false, reason: 'no texting consent on file (agent-uploaded rate check)' }
      } else if (lead?.sms_opted_out) {
        sms = { attempted: false, reason: 'sms_opted_out' }
      } else if (!agency?.twilio_from_number) {
        sms = { attempted: false, reason: 'agency has no twilio_from_number' }
      } else if (!lead?.phone) {
        sms = { attempted: false, reason: 'lead has no phone' }
      } else {
        const smsBody = await textFor(supabase, 'sms.quote.lost', { name: rc.first_name, carrier: rc.carrier })
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

    await audit(supabase, {
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
