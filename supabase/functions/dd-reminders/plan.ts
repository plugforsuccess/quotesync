// supabase/functions/dd-reminders/plan.ts
// Which Drivers Ed reminder emails are due today. Pure (no Supabase, no Deno APIs) so
// it's unit-tested (tests/unit/ddReminders.test.mjs).
//
// Retake: the discount lasts 36 months from the certificate, but Allstate checks it at
// renewal, so the real deadline is the last auto renewal on or before the expiry. We
// project renewals forward from the customer's latest auto renewal on file (6-month
// terms). No renewal on file: the deadline is the expiry. Reminders go 60 and 14 days
// before the deadline.
// Stalled: enrolled but not finished, 3 and 10 days after enrolling.

export const DISCOUNT_MONTHS = 36
export const TERM_MONTHS = 6
const DAY = 86400000

export type Reminder = { kind: 'retake_60' | 'retake_14' | 'stall_3' | 'stall_10'; dueOn: string }

export function addMonths(iso: string, months: number): string {
  const d = new Date(iso)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() + months)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return d.toISOString().slice(0, 10)
}

const days = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / DAY)

/** The last renewal (projected in TERM_MONTHS steps from `lastRenewal`) on or before `expiry`. */
export function lastRenewalBefore(lastRenewal: string | null, expiry: string): string | null {
  if (!lastRenewal) return null
  let r = lastRenewal.slice(0, 10)
  if (r > expiry) {
    while (r > expiry) r = addMonths(r, -TERM_MONTHS)
    return r
  }
  while (addMonths(r, TERM_MONTHS) <= expiry) r = addMonths(r, TERM_MONTHS)
  return r
}

/** The retake deadline for a passed student. */
export function retakeDeadline(passedOn: string, lastRenewal: string | null): string {
  const expiry = addMonths(passedOn, DISCOUNT_MONTHS)
  const renewal = lastRenewalBefore(lastRenewal, expiry)
  // A renewal before they passed doesn't count (it's not one they can retake for).
  return renewal && renewal > passedOn.slice(0, 10) ? renewal : expiry
}

/**
 * What to send one student today (at most one), given what was already sent.
 * Windows keep a reminder from going out late: retake_60 from 60 down to 15 days before,
 * retake_14 in the last 14 days; stall_3 on days 3–9 after enrolling, stall_10 on 10–20.
 */
export function dueReminder(
  s: { status: string; enrolledOn: string | null; passedOn: string | null; lastRenewal: string | null },
  today: string,
  sent: Set<string>, // `${kind}|${dueOn}`
): Reminder | null {
  const has = (r: Reminder) => sent.has(`${r.kind}|${r.dueOn}`)
  if (s.status === 'completed' && s.passedOn) {
    const due = retakeDeadline(s.passedOn, s.lastRenewal)
    const left = days(due, today)
    const r14: Reminder = { kind: 'retake_14', dueOn: due }
    const r60: Reminder = { kind: 'retake_60', dueOn: due }
    if (left >= 0 && left <= 14 && !has(r14)) return r14
    if (left >= 15 && left <= 60 && !has(r60) && !has(r14)) return r60
    return null
  }
  if (s.status === 'active' && s.enrolledOn) {
    const since = days(today, s.enrolledOn.slice(0, 10))
    const s10: Reminder = { kind: 'stall_10', dueOn: s.enrolledOn.slice(0, 10) }
    const s3: Reminder = { kind: 'stall_3', dueOn: s.enrolledOn.slice(0, 10) }
    if (since >= 10 && since <= 20 && !has(s10)) return s10
    if (since >= 3 && since <= 9 && !has(s3)) return s3
  }
  return null
}
