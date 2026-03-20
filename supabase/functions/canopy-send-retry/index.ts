// supabase/functions/canopy-send-retry/index.ts
// Called by pg_cron every 5 minutes.
// Finds leads where Canopy SMS was deferred (transcript was missing at send time)
// and retries now that transcript may be available.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendCanopyLink } from '../_shared/sendCanopyLink.ts'

Deno.serve(async (req) => {
  // Auth: service role only
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  // Find deferred leads
  const { data: leads, error } = await supabase
    .from('leads')
    .select('id, phone, bland_call_transcript, canopy_link_sent, canopy_send_pending')
    .eq('canopy_send_pending', true)
    .eq('canopy_link_sent', false)
    .not('bland_call_transcript', 'is', null)
    .not('phone', 'is', null)
    .limit(20)

  if (error || !leads?.length) {
    return new Response(JSON.stringify({ retried: 0 }), { status: 200 })
  }

  let retried = 0
  let succeeded = 0

  for (const lead of leads) {
    retried++
    const result = await sendCanopyLink({
      lead_id: lead.id,
      phone_number: lead.phone,
      supabase,
    })

    if (result.sent) {
      succeeded++
      // Clear pending flag
      await supabase
        .from('leads')
        .update({ canopy_send_pending: false })
        .eq('id', lead.id)

      await supabase.from('audit_log').insert({
        event_type: 'CANOPY_SEND_RETRY_SUCCESS',
        lead_id: lead.id,
        metadata: { retried: true },
      })
    } else if (result.reason === 'no_transcript') {
      // Still no transcript — leave pending, try next cycle
      console.log(`[CANOPY_RETRY] Lead ${lead.id} still has no transcript`)
    } else {
      // Other failure — clear pending to avoid infinite retry loop
      await supabase
        .from('leads')
        .update({ canopy_send_pending: false })
        .eq('id', lead.id)
      console.error(`[CANOPY_RETRY] Lead ${lead.id} failed: ${result.reason}`)
    }
  }

  return new Response(JSON.stringify({ retried, succeeded }), { status: 200 })
})
