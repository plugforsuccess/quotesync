// Supabase Edge Function: get-available-agents
// POST /functions/v1/get-available-agents
// Returns an ordered list of available agents for Bland transfer routing.
// Called by trigger-bland-outbound at dispatch time.
// Auth: Service role only.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const E164_REGEX = /^\+1[2-9]\d{9}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Auth: service role only
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const token = authHeader.replace('Bearer ', '')
  if (token !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Forbidden — service role required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey
  )

  try {
    const { agency_id } = await req.json()

    if (!agency_id) {
      return new Response(JSON.stringify({ error: 'agency_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Live query — never cached
    const { data: agents, error } = await supabase
      .from('agent_availability')
      .select(`
        user_id,
        transfer_phone,
        priority_tier,
        last_toggled_at,
        auto_reset_at,
        profiles!inner ( full_name )
      `)
      .eq('agency_id', agency_id)
      .eq('available', true)
      .not('transfer_phone', 'is', null)
      .order('priority_tier', { ascending: true })
      .order('last_toggled_at', { ascending: true })

    if (error) {
      console.error('[GET_AVAILABLE_AGENTS] Query error:', error)
      return new Response(JSON.stringify({ error: 'Database query failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Filter: must have active agency_memberships with principal/producer role
    // and valid E.164 phone, and not past auto_reset_at
    const now = new Date()
    const validAgents: Array<{
      user_id: string
      name: string
      transfer_phone: string
      priority_tier: number
    }> = []

    for (const agent of (agents || [])) {
      // Check auto_reset_at — skip if expired
      if (agent.auto_reset_at && new Date(agent.auto_reset_at) <= now) {
        continue
      }

      // Validate E.164 format
      if (!E164_REGEX.test(agent.transfer_phone)) {
        continue
      }

      // Verify active membership with principal/producer role
      const { data: membership } = await supabase
        .from('agency_memberships')
        .select('id')
        .eq('user_id', agent.user_id)
        .eq('agency_id', agency_id)
        .eq('status', 'active')
        .in('agency_role', ['principal', 'producer'])
        .limit(1)
        .maybeSingle()

      if (!membership) continue

      validAgents.push({
        user_id: agent.user_id,
        name: (agent.profiles as any)?.full_name || 'Unknown',
        transfer_phone: agent.transfer_phone,
        priority_tier: agent.priority_tier,
      })
    }

    return new Response(JSON.stringify({
      agents: validAgents,
      is_anyone_available: validAgents.length > 0,
      count: validAgents.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('[GET_AVAILABLE_AGENTS] Error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
