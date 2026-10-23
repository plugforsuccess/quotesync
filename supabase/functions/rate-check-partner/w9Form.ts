// supabase/functions/rate-check-partner/w9Form.ts
// The blank IRS Form W-9 (page 1 only, the fillable form) that the function fills.
// It's served from the app's own site as public/forms/fw9.pdf (the IRS form is public)
// and fetched here once per instance, then checked against the SHA-256 below so a
// changed or truncated file can never be filled. To swap revisions: trim the new PDF
// to page 1 (pypdf: append page 0 to a PdfWriter keeps the fields), replace
// public/forms/fw9.pdf, update the hash and W9_REVISION, deploy both.
//
// The IRS field names (f1_01 … f1_15, c1_1[0..6], c1_2) have been stable across
// revisions; the June 2026 revision adds date fields f1_16-18, which the function
// fills when present and otherwise draws the date as text.

export const W9_REVISION = 'Rev. March 2024'
const W9_SHA256 = '82f24a80de54cafff33106af46f69f92fe000f8fcaa26a0ef90774b8ddfb7ebe'
// Override with the W9_BLANK_URL secret if the site moves.
const W9_URL = Deno.env.get('W9_BLANK_URL') || 'https://insuredbycam.com/forms/fw9.pdf'

let cached: Uint8Array | null = null

/** The blank form's bytes, fetched once and verified. Throws if it can't be trusted. */
export async function loadBlankW9(): Promise<Uint8Array> {
  if (cached) return cached
  const res = await fetch(W9_URL)
  if (!res.ok) throw new Error(`blank W-9 fetch failed: ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
  if (hex !== W9_SHA256) throw new Error('blank W-9 does not match the expected file')
  cached = bytes
  return bytes
}
