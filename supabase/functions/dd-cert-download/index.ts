// Supabase Edge Function: dd-cert-download
// POST /functions/v1/dd-cert-download   (verify_jwt = true)
// Returns a short-lived signed URL for a certificate PDF, gated to staff /
// principal / admin. (Insureds download their own via dd-issue-certificate.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigins = [
  'https://insuredbycam.com',
  'https://www.insuredbycam.com',
  'https://quotesync.vercel.app',
]
const envOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')
if (envOrigin && !allowedOrigins.includes(envOrigin)) allowedOrigins.push(envOrigin)
function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const ok = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')
  return {
    'Access-Control-Allow-Origin': ok ? origin : allowedOrigins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req) => {
  const ch = cors(req)
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...ch, 'Content-Type': 'application/json' } })
  if (req.method === 'OPTIONS') return new Response('ok', { headers: ch })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || SERVICE_KEY

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  try {
    const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    // Authorize via the same role helpers used by RLS.
    const [{ data: isStaff }, { data: isPrincipal }] = await Promise.all([
      supabaseUser.rpc('dd_is_staff'),
      supabaseUser.rpc('dd_is_principal'),
    ])
    if (!isStaff && !isPrincipal) return json({ error: 'Forbidden' }, 403)

    const body = await req.json().catch(() => ({}))
    const certificateId = (body.certificate_id || '').toString()
    if (!certificateId) return json({ error: 'certificate_id required' }, 400)

    const { data: cert } = await supabase
      .from('dd_certificates').select('pdf_path').eq('id', certificateId).maybeSingle()
    if (!cert?.pdf_path) return json({ error: 'Certificate not found' }, 404)

    const { data: signed, error: signErr } = await supabase.storage
      .from('dd-certificates').createSignedUrl(cert.pdf_path, 600)
    if (signErr) throw signErr

    return json({ url: signed.signedUrl })
  } catch (err) {
    console.error('dd-cert-download error:', err?.message || err)
    return json({ error: 'Could not generate download link.' }, 500)
  }
})
