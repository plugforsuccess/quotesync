// supabase/functions/_shared/scanErrors.ts
// Was a failed dec-page scan our problem (the scanner's account or service) or the photo's?
// Our problem: the customer isn't asked to retake, and the principal is alerted. Kept in
// step with src/lib/scanErrors.js (tests/unit/scanErrors.test.mjs checks they match).
export type ScannerProblem = { kind: 'limit' | 'key' | 'busy' | 'other'; reason: string; fix: string }

const SERVICE = /Anthropic API error|ANTHROPIC_API_KEY|fetch failed|network|timed? ?out|ECONN|aborted/i

export function scannerProblem(error: string | null | undefined): ScannerProblem | null {
  const e = String(error || '')
  if (!e || !SERVICE.test(e)) return null
  if (/usage limits|credit balance|billing|spend/i.test(e)) {
    return { kind: 'limit', reason: 'The Anthropic account behind the scanner hit its spending limit.', fix: 'Raise the limit at console.anthropic.com → Settings → Limits.' }
  }
  if (/\((401|403)\)|ANTHROPIC_API_KEY|x-api-key|authentication/i.test(e)) {
    return { kind: 'key', reason: 'The scanner’s Anthropic API key isn’t working.', fix: 'Update ANTHROPIC_API_KEY in Supabase → Edge Functions → Secrets.' }
  }
  if (/\((429|5\d\d)\)|overloaded|rate.?limit/i.test(e)) {
    return { kind: 'busy', reason: 'Anthropic’s service was busy or down.', fix: 'It usually clears up on its own. Tap Scan Again in a few minutes.' }
  }
  return { kind: 'other', reason: 'The scanner couldn’t reach Anthropic.', fix: 'Tap Scan Again. If it keeps happening, tell your developer.' }
}
