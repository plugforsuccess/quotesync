// supabase/functions/list-followups/plan.ts
// Which follow-up email (if any) a person on a list gets today. Pure, so it's unit-tested
// (tests/unit/listFollowups.test.mjs).
//
// A list's sequence is up to 3 emails, each on a day counted from when the person was
// added ([{ day, on }]). Emails go in order; one that's switched off is skipped. Two emails
// are never closer together than their days are apart (so imports sent late in daily waves
// still get them spaced out). It stops for good when they upload, get quoted, or unsubscribe.
// People a producer added get email 1 only while it's fresh (within LATE_DAYS of its day),
// so switching a list on later doesn't send "good talking with you" months on.

export const LATE_DAYS = 14
export const DEFAULT_SEQUENCE = [{ day: 3, on: true }, { day: 10, on: true }, { day: 30, on: true }]
const DAY = 86400000
const SLACK = 0.1 // the daily run's time drifts by minutes; don't push an email a whole day for it

export type Step = { day: number; on: boolean }
export type Member = { email: string; source: string; created_at: string; steps_sent: number; last_sent_at: string | null; stopped_reason: string | null }
export type Signals = { unsubscribed: boolean; uploaded: boolean; quoted: boolean }

/** { stop: reason } to end the sequence, { step: index } to send, or null (nothing today). */
export function nextStep(m: Member, sequence: Step[] | null, s: Signals, now: Date): { stop: string } | { step: number } | null {
  if (m.stopped_reason) return null
  if (s.unsubscribed) return { stop: 'unsubscribed' }
  if (s.uploaded) return { stop: 'uploaded' }
  if (s.quoted) return { stop: 'quoted' }
  const seq = (sequence?.length ? sequence : DEFAULT_SEQUENCE).slice(0, 3)
  let i = m.steps_sent
  while (i < seq.length && !seq[i]?.on) i++
  if (i >= seq.length) return null
  const day = Math.max(0, Number(seq[i].day) || 0)
  const age = (now.getTime() - Date.parse(m.created_at)) / DAY
  if (age < day - SLACK) return null
  if (m.steps_sent === 0 && m.source !== 'import' && age > day + LATE_DAYS) return null
  if (m.last_sent_at && m.steps_sent > 0) {
    const prevDay = Math.max(0, Number(seq[m.steps_sent - 1]?.day) || 0)
    const gap = Math.max(1, day - prevDay)
    if ((now.getTime() - Date.parse(m.last_sent_at)) / DAY < gap - SLACK) return null
  }
  return { step: i }
}
