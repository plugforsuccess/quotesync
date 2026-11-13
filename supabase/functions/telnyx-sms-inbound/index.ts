// Supabase Edge Function: telnyx-sms-inbound
// POST /functions/v1/telnyx-sms-inbound   (verify_jwt = false — Telnyx calls it; checked by signature)
//
// Set this URL as the messaging profile's inbound webhook in Telnyx. It handles:
//   message.received   a text to the agency number:
//                        STOP (and STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT) → opted out everywhere, no reply
//                          (Telnyx/the carrier send the opt-out confirmation)
//                        START / UNSTOP → opted back in, confirmation reply
//                        HELP → who we are and how to stop
//                        Y / YES / OK / 👍 … after a Rate Check quote-ready text → call confirmed, agent alerted
//                        anything else → forwarded to the agent's cell
//   message.sent / message.finalized   delivery updates for Quick Send texts (rate_check_invites.sms_sid)
//
// Secrets: TELNYX_API_KEY, TELNYX_FROM_NUMBER, TELNYX_PUBLIC_KEY; AGENT_PHONE_NUMBER (or agencies.agent_cell_number).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { digits10, sendText, statusFromTelnyx, telnyxWebhookOk } from '../_shared/sms.ts'

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
const START_WORDS = ['START', 'UNSTOP', 'YES START']
const STATUS_RANK: Record<string, number> = { requested: 0, queued: 1, sent: 2, delivered: 3, failed: 3, blocked: 3 }
const ok = () => new Response('ok', { status: 200 })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  const raw = await req.text()
  if (!(await telnyxWebhookOk(raw, req.headers))) {
    console.error('[TELNYX_INBOUND] bad or missing signature')
    return new Response('bad signature', { status: 403 })
  }
  let event: any
  try { event = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }
  const type = String(event?.data?.event_type || '')
  const p = event?.data?.payload || {}
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    // ── Delivery updates for texts we sent ──
    if (type === 'message.sent' || type === 'message.finalized') {
      const status = statusFromTelnyx(p?.to?.[0]?.status)
      if (p?.id && status) {
        const { data: inv } = await supabase.from('rate_check_invites').select('id, sms_status').eq('sms_sid', p.id).maybeSingle()
        if (inv && (STATUS_RANK[status] ?? 0) > (STATUS_RANK[inv.sms_status] ?? -1)) {
          const err = p?.errors?.[0]
          await supabase.from('rate_check_invites').update({
            sms_status: status, sms_status_at: new Date().toISOString(),
            ...(status === 'failed' ? { sms_error: err?.title || err?.detail || 'Not delivered' } : {}),
          }).eq('id', inv.id)
        }
      }
      return ok()
    }
    if (type !== 'message.received') return ok()

    const from = digits10(p?.from?.phone_number)
    const body = String(p?.text || '').trim()
    if (!from) return ok()
    const word = body.toUpperCase().replace(/[^A-Z ]/g, '').trim()
    const now = new Date().toISOString()

    const { data: lead } = await supabase.from('leads')
      .select('id, first_name, agency_id').eq('phone', from)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    let brand = 'Cam Wiley Agency', email = '', agentFirst = 'Cam', agentCell = Deno.env.get('AGENT_PHONE_NUMBER') || ''
    if (lead?.agency_id) {
      const { data: a } = await supabase.from('agencies')
        .select('brand_name, email, agent_first_name, agent_cell_number').eq('id', lead.agency_id).maybeSingle()
      if (a?.email) email = a.email
      if (a?.agent_first_name) agentFirst = a.agent_first_name
      if (a?.agent_cell_number) agentCell = a.agent_cell_number
      if (a?.brand_name && !/insuredbycam/i.test(a.brand_name)) brand = a.brand_name
    }
    if (lead) {
      await supabase.from('lead_messages').insert({ lead_id: lead.id, direction: 'inbound', channel: 'sms', body, twilio_sid: p?.id || null, status: 'received' })
    }
    const toAgent = (msg: string) => (digits10(agentCell) ? sendText(agentCell, msg) : Promise.resolve(null))

    if (STOP_WORDS.includes(word)) {
      await supabase.from('sms_opt_outs').upsert({ phone: from, opted_out_at: now, opted_in_at: null, source: 'stop_reply' }, { onConflict: 'phone' })
      await supabase.from('leads').update({ sms_opted_out: true }).eq('phone', from)
      return ok()
    }
    if (START_WORDS.includes(word)) {
      await supabase.from('sms_opt_outs').update({ opted_in_at: now }).eq('phone', from)
      await supabase.from('leads').update({ sms_opted_out: false }).eq('phone', from)
      await sendText(from, `${brand}: You’re subscribed again. Reply STOP to opt out.`)
      return ok()
    }
    if (word === 'HELP' || word === 'INFO') {
      await sendText(from, `${brand}: insurance quotes and reminders. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out.${email ? ` Help: ${email}` : ''}`)
      return ok()
    }

    const saidYes = /^(y|ya|yes|yeah|yea|yep|yup|ok|okay|sure|quote)\b/i.test(body.replace(/^[^a-z0-9]+/i, '')) || /^\s*\u{1F44D}/u.test(body)
    if (saidYes) {
      const { data: confirmed } = await supabase.from('rate_checks')
        .update({ call_confirmed_at: now }).eq('phone', from)
        .not('quote_ready_texted_at', 'is', null).is('call_confirmed_at', null).select('id, first_name')
      if (confirmed?.length) {
        if (lead) await supabase.from('leads').update({ status: 'interested', contacted_at: now }).eq('id', lead.id)
        const name = confirmed[0].first_name || lead?.first_name || 'A customer'
        await toAgent(`${name} replied Y to their Rate Check quote and wants a call: (${from.slice(0, 3)}) ${from.slice(3, 6)}-${from.slice(6)}. Call them now.`)
        await sendText(from, `Got it, ${name}! ${agentFirst} will call you shortly to go over your quote.`)
        return ok()
      }
    }

    // Anything else goes to the agent's cell.
    const who = lead?.first_name ? `${lead.first_name} ` : ''
    await toAgent(`Text from ${who}(${from.slice(0, 3)}) ${from.slice(3, 6)}-${from.slice(6)}: ${body.slice(0, 600)}`)
    return ok()
  } catch (e) {
    console.error('[TELNYX_INBOUND] error:', (e as Error).message)
    return ok() // never make Telnyx retry a message we already saw
  }
})
