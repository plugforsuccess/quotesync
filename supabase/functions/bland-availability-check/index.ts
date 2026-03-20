// supabase/functions/bland-availability-check/index.ts
// Called by the Bland inbound agent mid-conversation.
// Auth: shared secret via query param (?secret=BLAND_AVAILABILITY_SECRET)
// Returns: minimal availability payload for Bland to use as conversation variables.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const AGENCY_ID = '00000000-0000-0000-0000-000000000001' // Wiley-Wilson — single tenant for now
const E164_REGEX = /^\+1[2-9]\d{9}$/

function isEasternBusinessHours(): boolean {
  const now = new Date()
  const eastern = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)

  const day = eastern.find(p => p.type === 'weekday')?.value
  const hour = parseInt(eastern.find(p => p.type === 'hour')?.value || '0', 10)

  const isWeekday = !['Sat', 'Sun'].includes(day || '')
  return isWeekday && hour >= 9 && hour < 18
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  // Validate shared secret
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret')
  const expectedSecret = Deno.env.get('BLAND_AVAILABILITY_SECRET')

  if (!expectedSecret || secret !== expectedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Query available agents — same logic as get-available-agents
    // JOIN agency_memberships to enforce role filter (not agency_users — that table is dropped)
    const now = new Date()
    const { data: agents, error } = await supabase
      .from('agent_availability')
      .select(`
        transfer_phone,
        priority_tier,
        last_toggled_at,
        auto_reset_at,
        agency_memberships!inner ( agency_role, status )
      `)
      .eq('agency_id', AGENCY_ID)
      .eq('available', true)
      .not('transfer_phone', 'is', null)
      .eq('agency_memberships.status', 'active')
      .in('agency_memberships.agency_role', ['principal', 'producer'])
      .order('priority_tier', { ascending: true })
      .order('last_toggled_at', { ascending: true })

    if (error) throw error

    // Filter: E.164 valid, auto_reset_at not expired
    const validAgents = (agents || []).filter(a => {
      if (a.auto_reset_at && new Date(a.auto_reset_at) <= now) return false
      if (!E164_REGEX.test(a.transfer_phone)) return false
      return true
    })

    const is_business_hours = isEasternBusinessHours()
    const is_anyone_available = is_business_hours && validAgents.length > 0

    return new Response(JSON.stringify({
      is_business_hours,
      is_anyone_available,
      transfer_number_1: validAgents[0]?.transfer_phone ?? null,
      transfer_number_2: validAgents[1]?.transfer_phone ?? null,
      transfer_number_3: validAgents[2]?.transfer_phone ?? null,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[BLAND_AVAIL_CHECK] Error:', err)
    return new Response(JSON.stringify({
      is_business_hours: false,
      is_anyone_available: false,
      transfer_number_1: null,
      transfer_number_2: null,
      transfer_number_3: null,
    }), {
      status: 200, // always 200 — fail safe: Bland gets "unavailable" on error
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
