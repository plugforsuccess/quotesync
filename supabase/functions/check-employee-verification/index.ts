// Supabase Edge Function: check-employee-verification
// Runs daily via pg_cron at 8 AM ET (1 PM UTC).
// Checks for active employees whose last_verified_at is NULL or > 90 days.
// Sends a Slack alert if any are found (with dedup to avoid spam).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req: Request) => {
  // Only allow POST (from pg_cron or manual trigger)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  // Auth: require service role key
  const authHeader = req.headers.get('Authorization') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!authHeader.includes(serviceRoleKey) && serviceRoleKey) {
    const token = authHeader.replace('Bearer ', '')
    if (token !== serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    // Find active employees due for verification
    const { data: overdueEmployees, error: queryError } = await supabase
      .from('employees')
      .select('id, org_id, first_name, last_name, last_verified_at, verification_alert_sent_at')
      .eq('employment_status', 'active')
      .or(`last_verified_at.is.null,last_verified_at.lt.${ninetyDaysAgo.toISOString()}`)

    if (queryError) {
      console.error('Query error:', queryError)
      return new Response(JSON.stringify({ error: queryError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!overdueEmployees || overdueEmployees.length === 0) {
      return new Response(JSON.stringify({ message: 'No verifications due.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Filter to only employees that haven't been alerted yet
    // (verification_alert_sent_at is NULL or was reset after last verification)
    const needAlert = overdueEmployees.filter((emp) => {
      if (!emp.verification_alert_sent_at) return true
      // If alert was already sent and employee hasn't been verified since,
      // don't re-alert (dedup)
      if (emp.last_verified_at && new Date(emp.verification_alert_sent_at) < new Date(emp.last_verified_at)) {
        return true // Employee was verified after last alert, now overdue again
      }
      return false // Alert already sent for this overdue period
    })

    if (needAlert.length === 0) {
      return new Response(JSON.stringify({ message: 'Alerts already sent for overdue employees.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Build Slack message
    const slackWebhook = Deno.env.get('SLACK_WEBHOOK_ALERTS')
    if (slackWebhook) {
      const lines = needAlert.map((emp) => {
        const name = `${emp.first_name} ${emp.last_name}`
        if (!emp.last_verified_at) {
          return `• ${name} — last verified: Never`
        }
        const days = Math.floor(
          (Date.now() - new Date(emp.last_verified_at).getTime()) / (1000 * 60 * 60 * 24)
        )
        const dateStr = new Date(emp.last_verified_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
        return `• ${name} — last verified: ${days} days ago (${dateStr})`
      })

      const siteUrl = Deno.env.get('SITE_URL') || 'https://www.insuredbycam.com'

      const slackPayload = {
        text: `🔔 Employee Verification Due\n\nThe following employee records haven't been verified in 90+ days:\n\n${lines.join('\n')}\n\nReview and verify: <${siteUrl}/admin/agency/employees|View Employee Roster →>`,
      }

      try {
        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload),
        })
      } catch (slackErr) {
        console.error('Slack webhook error:', slackErr)
      }
    }

    // Mark employees as alerted (dedup flag)
    const alertIds = needAlert.map((emp) => emp.id)
    const { error: updateError } = await supabase
      .from('employees')
      .update({ verification_alert_sent_at: new Date().toISOString() })
      .in('id', alertIds)

    if (updateError) {
      console.error('Failed to update alert timestamps:', updateError)
    }

    return new Response(
      JSON.stringify({
        message: `Alerted for ${needAlert.length} employee(s).`,
        employees: needAlert.map((e) => `${e.first_name} ${e.last_name}`),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
