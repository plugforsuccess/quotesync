// Shared CORS headers for Edge Functions
// F-06 fix: Restrict origin to production domain (env-configurable for dev)

const allowedOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN') || 'https://insuredbycam.com'

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-canopy-signature',
}
