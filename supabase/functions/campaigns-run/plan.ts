// supabase/functions/campaigns-run/plan.ts
// The rules of a campaign, pure (no database), so they're unit-tested
// (tests/unit/campaigns.test.mjs) and shared with the Campaigns page preview.
//
//   A drip's steps go out in order, each on its day counted from when the person joined,
//   and never two in one day. A blast is one step, at its send time.
//   A person stops for good when they leave the audience (bought, unsubscribed from a list,
//   an affiliate turned off), when they send a policy after joining (if the campaign says
//   so), or after the last step. A step they can't get (no email, no text consent, opted
//   out) is skipped, and the next one waits for its own day.
//   Messages only go out 9am–8pm Eastern.

export type Step = {
  id?: string
  channel: 'email' | 'text'
  day: number
  subject?: string
  body: string
  button?: string // 'rate_check' | 'affiliates' | 'courses' | 'their_link' | 'portal' | 'none'
  button_label?: string
}
export type Campaign = {
  kind: 'drip' | 'blast'
  steps: Step[]
  stop_on_upload: boolean
  send_at: string | null
}
export type Enrollment = { enrolled_at: string; steps_done: number; last_sent_at: string | null; stopped_reason: string | null }
export type Signals = {
  inAudience: boolean
  uploadedSince: boolean // sent a policy after they joined
  email: string | null
  unsubscribed: boolean // email opt-out
  phone: string | null
  smsOk: boolean // agreed to texts
  textOptedOut: boolean // replied STOP
}
export type Action =
  | { stop: string }
  | { send: number; channel: 'email' | 'text' }
  | { skip: number; channel: 'email' | 'text'; note: string }
  | null

const DAY = 86400000
const SLACK = 0.1 * DAY // the hourly run drifts; don't push a step a whole day for it
const MIN_GAP = 20 * 3600000 // two steps never land on the same day

/** The hour in Georgia (0–23). */
export function easternHour(now: Date) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now))
}
export const inSendWindow = (now: Date) => { const h = easternHour(now); return h >= 9 && h < 20 }

/** What to do for one person now. */
export function nextAction(c: Campaign, e: Enrollment, s: Signals, now: Date): Action {
  if (e.stopped_reason) return null
  if (!s.inAudience) return { stop: 'left_audience' }
  if (c.stop_on_upload && s.uploadedSince) return { stop: 'uploaded' }
  const steps = c.kind === 'blast' ? c.steps.slice(0, 1) : c.steps
  const i = e.steps_done
  if (i >= steps.length) return { stop: 'finished' }
  const step = steps[i]
  const t = now.getTime()
  if (c.kind === 'blast') {
    if (!c.send_at || new Date(c.send_at).getTime() > t) return null
  } else {
    if (new Date(e.enrolled_at).getTime() + Math.max(0, Number(step.day) || 0) * DAY - SLACK > t) return null
    if (e.last_sent_at && t - new Date(e.last_sent_at).getTime() < MIN_GAP) return null
  }
  if (step.channel === 'text') {
    if (!s.phone || !s.smsOk) return { skip: i, channel: 'text', note: 'no_text_consent' }
    if (s.textOptedOut) return { skip: i, channel: 'text', note: 'replied_stop' }
    return { send: i, channel: 'text' }
  }
  if (!s.email) return { skip: i, channel: 'email', note: 'no_email' }
  if (s.unsubscribed) return { skip: i, channel: 'email', note: 'unsubscribed' }
  return { send: i, channel: 'email' }
}

/** The link a step's button (and [link]) points to, or '' for none. */
export function linkFor(button: string | undefined, site: string, extra: { code?: string; portal_token?: string } = {}) {
  switch (button) {
    case 'rate_check': return `${site}/?start=1`
    case 'affiliates': return `${site}/affiliates`
    case 'courses': return `${site}/courses/defensive-driving`
    case 'their_link': return extra.code ? `${site}/r/${extra.code}` : ''
    case 'portal': return extra.portal_token ? `${site}/affiliate/${extra.portal_token}` : ''
    default: return ''
  }
}

/** The blanks a message can use: [first name], [link], [affiliate link], [portal link]. */
export function varsFor(person: { first_name?: string | null; extra?: { code?: string; portal_token?: string } | null }, step: Step, site: string) {
  const extra = person.extra || {}
  return {
    'first name': (person.first_name || '').trim() || 'there',
    link: linkFor(step.button, site, extra) || `${site}/?start=1`,
    'affiliate link': linkFor('their_link', site, extra),
    'portal link': linkFor('portal', site, extra),
  } as Record<string, string>
}

export const fill = (s: string, vars: Record<string, string>) =>
  String(s || '').replace(/\[([a-z ]+)\]/gi, (m, k) => vars[k.toLowerCase()] ?? m)

/** A step as an email template for _shared/email.ts renderEmail: each line is a paragraph (so a sign-off stays on its own lines). */
export function emailTemplate(step: Step) {
  const paragraphs = String(step.body || '').split(/\n/).map(p => p.trim()).filter(Boolean)
  const button = step.button && step.button !== 'none' ? { label: (step.button_label || '').trim() || 'Check My Rate', link: 'link' } : undefined
  return { key: 'campaign', subject: (step.subject || '').trim() || 'A quick note from Cam Wiley Agency', paragraphs, ...(button ? { button } : {}), unsub: true }
}

/** A text step's message: who it's from first, and how to opt out last. */
export function textMessage(step: Step, vars: Record<string, string>) {
  let msg = fill(step.body, vars).trim()
  if (!/cam wiley/i.test(msg)) msg = `Cam Wiley Agency: ${msg}`
  if (!/reply stop/i.test(msg)) msg = `${msg} Reply STOP to opt out.`
  return msg
}
