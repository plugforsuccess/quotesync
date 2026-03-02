// Shared CORS headers for Edge Functions
// Supports www, non-www, and Vercel preview URLs

const allowedOrigins = [
  'https://insuredbycam.com',
  'https://www.insuredbycam.com',
  'https://quotesync.vercel.app',
]

// Add custom origin from env (e.g. http://localhost:5173 for dev)
const envOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')
if (envOrigin && !allowedOrigins.includes(envOrigin)) {
  allowedOrigins.push(envOrigin)
}

/**
 * Dynamic CORS headers — matches the request's Origin against the allowlist.
 * Use this in functions that receive browser requests.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const matched = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-signature',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/**
 * Static CORS headers — backward-compatible export for internal functions
 * (lead-notify-sms, lead-sms-drip, etc.) that have auth gates and don't
 * receive browser requests.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigins[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
