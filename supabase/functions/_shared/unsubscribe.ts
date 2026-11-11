// supabase/functions/_shared/unsubscribe.ts
// Signed unsubscribe links: <function url>?unsubscribe=<base64url email>.<HMAC>. One
// "don't email" list for the agency (dd_email_opt_outs). Same signing as dd-reminders,
// so a link from either function works at either.
const b64url = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64url = (s: string) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

async function sign(email: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email))
  return [...new Uint8Array(mac)].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function unsubscribeUrl(fnUrl: string, email: string) {
  const e = email.toLowerCase()
  return `${fnUrl}?unsubscribe=${b64url(e)}.${await sign(e)}`
}

/** The email in a valid token, else null. */
export async function emailFromToken(token: string): Promise<string | null> {
  const [e, sig] = token.split('.')
  let email = ''
  try { email = unb64url(e || '').toLowerCase() } catch { return null }
  return email && sig === await sign(email) ? email : null
}

export const unsubscribePage = (ok: boolean) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0F2D6B">` +
  (ok ? '<h1 style="font-size:1.4rem">You’re unsubscribed.</h1><p>You won’t get emails like this from Cam Wiley Agency anymore.</p>' : '<p>That unsubscribe link isn’t valid.</p>') +
  `</body>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
)
