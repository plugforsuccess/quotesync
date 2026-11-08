// supabase/functions/list-followups/plan.ts
// Who gets the list follow-up today. Pure, so it's unit-tested (tests/unit/listFollowups.test.mjs).
export const FOLLOW_UP_DAYS = 3
export const WINDOW_DAYS = 14 // added longer ago than this: never (no backlog when switched on)
const DAY = 86400000

type Member = { id: string; email: string; source: string; created_at: string; followup_sent_at: string | null }

export function followUpsDue<M extends Member>(members: M[], optedOut: Set<string>, now: Date): M[] {
  return members.filter(m => {
    if (m.followup_sent_at || m.source === 'import') return false
    if (optedOut.has(m.email.toLowerCase())) return false
    const age = (now.getTime() - Date.parse(m.created_at)) / DAY
    return age >= FOLLOW_UP_DAYS && age <= WINDOW_DAYS
  })
}
