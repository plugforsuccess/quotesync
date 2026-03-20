// supabase/functions/bland-retry-poll/index.ts
// Finds leads with bland_retry_at <= NOW() and fires trigger-bland-outbound for each.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (req.headers.get('Authorization') !== `Bearer ${serviceKey}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .not('bland_retry_at', 'is', null)
    .lte('bland_retry_at', new Date().toISOString())
    .in('bland_outbound_status', ['no-answer', 'no_answer'])
    .limit(10)

  if (!leads?.length) {
    return new Response(JSON.stringify({ retried: 0 }), { status: 200 })
  }

  // Clear retry_at immediately to prevent double-firing
  await supabase
    .from('leads')
    .update({ bland_retry_at: null })
    .in('id', leads.map(l => l.id))

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!

  // Fire trigger-bland-outbound for each — fire-and-forget
  await Promise.all(leads.map(lead =>
    fetch(`${supabaseUrl}/functions/v1/trigger-bland-outbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ lead_id: lead.id }),
    }).catch(err => console.error(`[BLAND_RETRY_POLL] Failed for lead ${lead.id}:`, err))
  ))

  return new Response(JSON.stringify({ retried: leads.length }), { status: 200 })
})
