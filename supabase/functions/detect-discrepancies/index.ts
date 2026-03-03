// Supabase Edge Function: detect-discrepancies
// POST /functions/v1/detect-discrepancies
//
// Detects CS performance discrepancies, writes alerts to discrepancy_alerts table,
// and sends Slack webhook messages for new alerts.
//
// Trigger modes:
//   { "scope": "upload", "week_start": "2026-03-03", "employee_user_id": "uuid", "org_id": "uuid" }
//   { "scope": "current_week" }       — nightly cron (all employees)
//   { "scope": "weekly_digest" }      — Friday digest summary

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types ────────────────────────────────────────────────────────────────────

interface AlertRecord {
  org_id: string
  employee_user_id: string
  employee_name: string
  week_start: string
  alert_date: string | null
  alert_type: string
  severity: 'critical' | 'warning' | 'info'
  message: string
}

interface TimeEntry {
  employee_user_id: string
  work_date: string
  code: string
  location: string | null
  hours_worked: number | null
}

interface RCData {
  employee_user_id: string
  employee_name: string
  week_start: string
  total_calls: number
  inbound_calls: number
  outbound_calls: number
  talk_time_minutes: number
  logged_in_minutes: number
  available_minutes: number
  offline_minutes: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMonday(d: Date): string {
  const date = new Date(d)
  const day = date.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  date.setDate(date.getDate() + diff)
  return date.toISOString().slice(0, 10)
}

function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 4) // Mon–Fri
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const yearOpts: Intl.DateTimeFormatOptions = { ...opts, year: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', yearOpts)}`
}

function severityEmoji(severity: string): string {
  if (severity === 'critical') return '🔴'
  if (severity === 'warning') return '🟡'
  return '🔵'
}

// ── Discrepancy Detection ────────────────────────────────────────────────────

function detectDiscrepancies(
  timeEntries: TimeEntry[],
  rcData: RCData,
  weekStart: string,
  orgId: string
): AlertRecord[] {
  const alerts: AlertRecord[] = []
  const employeeId = rcData.employee_user_id
  const employeeName = rcData.employee_name || employeeId.substring(0, 8)

  const totalHoursLogged = timeEntries.reduce(
    (sum, e) => sum + (parseFloat(String(e.hours_worked)) || 0),
    0
  )
  const loggedInHours = (rcData.logged_in_minutes || 0) / 60
  const talkTimeHours = (rcData.talk_time_minutes || 0) / 60
  const utilization = loggedInHours > 0 ? (talkTimeHours / loggedInHours) * 100 : 0

  const regOrWfhDays = timeEntries.filter((e) => ['REG', 'WFH'].includes(e.code))
  const regDayCount = regOrWfhDays.length || 1

  // 1. Hours Mismatch — time log >= 8h but RC logged-in < 5h
  if (
    totalHoursLogged >= 8 * regDayCount * 0.8 &&
    loggedInHours < 5 * regDayCount * 0.5
  ) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'hours_mismatch',
      severity: 'critical',
      message: `${employeeName} logged ${totalHoursLogged.toFixed(1)}h in time entries but only ${loggedInHours.toFixed(1)}h in RingCentral.`,
    })
  }

  // 2. Office But Offline — OFFICE days logged but RC < 1h logged in
  const officeDays = timeEntries.filter(
    (e) => e.location === 'OFFICE' && ['REG', 'WFH'].includes(e.code)
  )
  if (officeDays.length > 0 && loggedInHours < 1) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'office_offline',
      severity: 'critical',
      message: `${employeeName} logged ${officeDays.length} office day(s) but RingCentral shows < 1h logged in.`,
    })
  }

  // 3. Zero Outbound Calls on REG/WFH days
  if (regOrWfhDays.length > 0 && (rcData.outbound_calls || 0) === 0) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'zero_outbound',
      severity: 'critical',
      message: `${employeeName} logged ${regOrWfhDays.length} working day(s) but 0 outbound calls in RingCentral.`,
    })
  }

  // 4. Very Low Utilization (< 10%)
  if (utilization < 10 && loggedInHours > 2) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'low_utilization',
      severity: 'critical',
      message: `${employeeName} utilization is ${utilization.toFixed(1)}% (talk: ${talkTimeHours.toFixed(1)}h / logged-in: ${loggedInHours.toFixed(1)}h).`,
    })
  }

  // 5. Warning Utilization (10–15%)
  if (utilization >= 10 && utilization < 15 && loggedInHours > 2) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'warn_utilization',
      severity: 'warning',
      message: `${employeeName} utilization is ${utilization.toFixed(1)}% — below the 15% threshold.`,
    })
  }

  // 6. Frequent Absences (3+ SICK/EARLY in the week)
  const sickEarlyDays = timeEntries.filter((e) =>
    ['SICK', 'SICK_PART', 'EARLY'].includes(e.code)
  )
  if (sickEarlyDays.length >= 3) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'frequent_absence',
      severity: 'warning',
      message: `${employeeName} has ${sickEarlyDays.length} sick/early entries this week.`,
    })
  }

  // 7. Low Daily Outbound (< 4 calls on a working day — weekly proxy: < 20 total outbound for 5-day week)
  if (
    regOrWfhDays.length > 0 &&
    (rcData.outbound_calls || 0) > 0 &&
    (rcData.outbound_calls || 0) < 4 * regOrWfhDays.length
  ) {
    alerts.push({
      org_id: orgId,
      employee_user_id: employeeId,
      employee_name: employeeName,
      week_start: weekStart,
      alert_date: null,
      alert_type: 'low_daily_outbound',
      severity: 'warning',
      message: `${employeeName} averaged < 4 outbound calls/day (${rcData.outbound_calls} total over ${regOrWfhDays.length} days).`,
    })
  }

  return alerts
}

// ── Slack Message Builders ───────────────────────────────────────────────────

function buildAlertSlackMessage(
  alert: AlertRecord,
  appBaseUrl: string
): object {
  const weekLabel = formatWeekLabel(alert.week_start)
  const emoji = severityEmoji(alert.severity)
  const severityLabel = alert.severity.charAt(0).toUpperCase() + alert.severity.slice(1)
  const dashboardUrl = `${appBaseUrl}/admin/cs-performance?employee=${alert.employee_user_id}&week=${alert.week_start}`

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} CS Performance Alert`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Employee:*\n${alert.employee_name}` },
          { type: 'mrkdwn', text: `*Week:*\n${weekLabel}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${emoji} ${severityLabel}: ${alert.alert_type.replace(/_/g, ' ')}*\n${alert.message}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View Dashboard →' },
            url: dashboardUrl,
          },
        ],
      },
    ],
  }
}

function buildDigestSlackMessage(
  weekStart: string,
  summaries: Array<{
    name: string
    outbound: number
    utilization: number
    alertCount: number
    grade: string
  }>,
  unresolvedTotal: number,
  appBaseUrl: string
): object {
  const weekLabel = formatWeekLabel(weekStart)

  const lines = summaries.map((s) => {
    const flag = s.alertCount > 0 ? ` ⚠️` : ''
    return `${s.name.padEnd(16)} Grade: ${s.grade}  |  Outbound: ${s.outbound}  |  Utilization: ${s.utilization}%  |  Flags: ${s.alertCount}${flag}`
  })

  const avgOutbound = summaries.length > 0
    ? (summaries.reduce((s, r) => s + r.outbound, 0) / summaries.length).toFixed(1)
    : '0'
  const avgUtilization = summaries.length > 0
    ? (summaries.reduce((s, r) => s + r.utilization, 0) / summaries.length).toFixed(1)
    : '0'

  const text = [
    `📊 *Weekly CS Performance Summary — ${weekLabel}*\n`,
    '```',
    ...lines,
    '',
    `Team Avg:    Outbound: ${avgOutbound}  |  Utilization: ${avgUtilization}%`,
    '```',
    '',
    unresolvedTotal > 0
      ? `🔴 ${unresolvedTotal} unresolved alert${unresolvedTotal !== 1 ? 's' : ''} this week → <${appBaseUrl}/admin/cs-performance?week=${weekStart}|View Dashboard>`
      : '✅ No unresolved alerts this week.',
  ].join('\n')

  return {
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
    ],
  }
}

function calculateGrade(outbound: number, utilization: number): string {
  if (outbound >= 60 && utilization >= 25) return 'A'
  if (outbound >= 40 && utilization >= 20) return 'B'
  if (utilization < 10) return 'F'
  if (outbound < 30 || utilization < 15) return 'D'
  return 'C'
}

// ── Slack Sender ─────────────────────────────────────────────────────────────

async function sendSlack(webhookUrl: string, payload: object): Promise<boolean> {
  try {
    const resp = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return resp.ok
  } catch (err) {
    console.error('[SLACK] Send failed:', err)
    return false
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const body = await req.json()
    const scope = body.scope || 'upload'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appBaseUrl = Deno.env.get('APP_BASE_URL') || 'https://admin.insuredbycam.com'

    // Per-mode Slack webhooks: alerts go to #ops-alerts, digest goes to #weekly-digest.
    // Falls back to SLACK_WEBHOOK_URL if the specific secrets aren't set.
    const slackAlerts = Deno.env.get('SLACK_WEBHOOK_ALERTS') || Deno.env.get('SLACK_WEBHOOK_URL') || ''
    const slackDigest = Deno.env.get('SLACK_WEBHOOK_DIGEST') || Deno.env.get('SLACK_WEBHOOK_URL') || ''

    const supabase = createClient(supabaseUrl, supabaseKey)

    // ── Weekly Digest Mode ─────────────────────────────────────────────────
    if (scope === 'weekly_digest') {
      const weekStart = body.week_start || toMonday(new Date())

      // Fetch all RC data for the week
      const { data: allRC } = await supabase
        .from('rc_performance_data')
        .select('*')
        .eq('week_start', weekStart)

      if (!allRC || allRC.length === 0) {
        return new Response(JSON.stringify({ message: 'No RC data for digest', week: weekStart }), { status: 200 })
      }

      // Count unresolved alerts for the week
      const { count: unresolvedCount } = await supabase
        .from('discrepancy_alerts')
        .select('*', { count: 'exact', head: true })
        .eq('week_start', weekStart)
        .eq('resolved', false)

      // Count alerts per employee
      const { data: alertCounts } = await supabase
        .from('discrepancy_alerts')
        .select('employee_user_id')
        .eq('week_start', weekStart)
        .eq('resolved', false)

      const alertsByEmployee: Record<string, number> = {}
      for (const a of alertCounts || []) {
        alertsByEmployee[a.employee_user_id] = (alertsByEmployee[a.employee_user_id] || 0) + 1
      }

      const summaries = allRC.map((rc: RCData) => {
        const loggedInH = (rc.logged_in_minutes || 0) / 60
        const talkH = (rc.talk_time_minutes || 0) / 60
        const util = loggedInH > 0 ? Math.round((talkH / loggedInH) * 100) : 0
        return {
          name: rc.employee_name || rc.employee_user_id.substring(0, 8),
          outbound: rc.outbound_calls || 0,
          utilization: util,
          alertCount: alertsByEmployee[rc.employee_user_id] || 0,
          grade: calculateGrade(rc.outbound_calls || 0, util),
        }
      })

      if (slackDigest) {
        const digestMsg = buildDigestSlackMessage(weekStart, summaries, unresolvedCount ?? 0, appBaseUrl)
        await sendSlack(slackDigest, digestMsg)
      }

      return new Response(JSON.stringify({ message: 'Digest sent', employees: summaries.length }), { status: 200 })
    }

    // ── Detection Mode (upload or current_week) ────────────────────────────
    let weekStart: string
    let employeeFilter: string | null = null
    let orgId: string

    if (scope === 'upload') {
      weekStart = body.week_start
      employeeFilter = body.employee_user_id || null
      orgId = body.org_id
      if (!weekStart || !orgId) {
        return new Response(JSON.stringify({ error: 'week_start and org_id required for upload scope' }), { status: 400 })
      }
    } else {
      // current_week scope
      weekStart = toMonday(new Date())
      orgId = body.org_id || 'system'
    }

    // Fetch RC data
    let rcQuery = supabase
      .from('rc_performance_data')
      .select('*')
      .eq('week_start', weekStart)
    if (employeeFilter) {
      rcQuery = rcQuery.eq('employee_user_id', employeeFilter)
    }
    const { data: rcRecords } = await rcQuery

    if (!rcRecords || rcRecords.length === 0) {
      return new Response(JSON.stringify({ message: 'No RC data found', week: weekStart }), { status: 200 })
    }

    // Fetch time entries for all relevant employees
    const employeeIds = rcRecords.map((r: RCData) => r.employee_user_id)
    const { data: timeEntries } = await supabase
      .from('employee_time_entries')
      .select('*')
      .eq('week_start', weekStart)
      .in('employee_user_id', employeeIds)

    // Run detection for each employee
    let totalNewAlerts = 0
    let totalSlackSent = 0

    for (const rc of rcRecords as RCData[]) {
      const empEntries = (timeEntries || []).filter(
        (e: TimeEntry) => e.employee_user_id === rc.employee_user_id
      )

      const detected = detectDiscrepancies(empEntries, rc, weekStart, orgId)

      for (const alert of detected) {
        // Dedup check — try to insert, skip on conflict
        const { data: inserted, error: insertError } = await supabase
          .from('discrepancy_alerts')
          .upsert(
            {
              org_id: alert.org_id,
              employee_user_id: alert.employee_user_id,
              week_start: alert.week_start,
              alert_date: alert.alert_date,
              alert_type: alert.alert_type,
              severity: alert.severity,
              message: alert.message,
            },
            {
              onConflict: 'employee_user_id,week_start,alert_type,alert_date',
              ignoreDuplicates: true,
            }
          )
          .select('id, slack_sent')

        // If nothing was inserted (duplicate), skip Slack
        if (insertError) {
          console.error(`[DETECT] Insert error for ${alert.alert_type}:`, insertError.message)
          continue
        }

        // Check if this is a new record that needs Slack notification
        if (inserted && inserted.length > 0 && !inserted[0].slack_sent) {
          totalNewAlerts++

          // Send Slack message to #ops-alerts
          if (slackAlerts) {
            const slackPayload = buildAlertSlackMessage(alert, appBaseUrl)
            const sent = await sendSlack(slackAlerts, slackPayload)

            if (sent) {
              totalSlackSent++
              // Mark as sent
              await supabase
                .from('discrepancy_alerts')
                .update({ slack_sent: true, slack_sent_at: new Date().toISOString() })
                .eq('id', inserted[0].id)
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: 'Detection complete',
        week: weekStart,
        employees_checked: rcRecords.length,
        new_alerts: totalNewAlerts,
        slack_sent: totalSlackSent,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[DETECT] Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
