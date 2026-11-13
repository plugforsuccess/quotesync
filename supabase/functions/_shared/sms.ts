// Texting through Telnyx: one way to send, check a number's opt-out, and verify Telnyx's
// webhooks. Used by Quick Send, the sales workspace's Send Text, the upload form's code and
// the inbound handler (telnyx-sms-inbound).
//
// Secrets (Supabase → Edge Functions → Secrets):
//   TELNYX_API_KEY               API key (Telnyx → API Keys)
//   TELNYX_FROM_NUMBER           the agency's Telnyx number, e.g. +14045551234
//   TELNYX_MESSAGING_PROFILE_ID  optional: the messaging profile the number is on
//   TELNYX_PUBLIC_KEY            for checking webhooks are really from Telnyx (Telnyx → Keys & Credentials → Public Key)
//   SMS_TEST_ONLY_TO             optional, while testing: comma-separated numbers; nobody else is texted
//
// Until the key and number are set, sends fail with "Texting isn’t set up…", which the
// pages already handle by opening Messages on the producer's own phone.

const API = 'https://api.telnyx.com/v2/messages'

export const digits10 = (raw: unknown): string | null => {
  const d = String(raw ?? '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1')
  return /^\d{10}$/.test(d) ? d : null
}
const e164 = (raw: unknown) => { const d = digits10(raw); return d ? `+1${d}` : null }

export const smsReady = () => !!(Deno.env.get('TELNYX_API_KEY') && e164(Deno.env.get('TELNYX_FROM_NUMBER')))

// Telnyx's statuses, collapsed to the ones the pages show.
export function statusFromTelnyx(s: unknown): 'queued' | 'sent' | 'delivered' | 'failed' | null {
  const v = String(s || '')
  if (['queued', 'sending'].includes(v)) return 'queued'
  if (['sent', 'delivery_unconfirmed'].includes(v)) return 'sent'
  if (v === 'delivered') return 'delivered'
  if (['sending_failed', 'delivery_failed', 'expired'].includes(v)) return 'failed'
  return null
}

export type SmsResult = { ok: boolean; id?: string; status?: string; error?: string }

export async function sendText(to: unknown, text: string, opts: { webhookUrl?: string } = {}): Promise<SmsResult> {
  const key = Deno.env.get('TELNYX_API_KEY')
  const from = e164(Deno.env.get('TELNYX_FROM_NUMBER'))
  if (!key || !from) return { ok: false, error: 'Texting isn’t set up for this agency.' }
  const dest = e164(to)
  if (!dest) return { ok: false, error: 'That isn’t a 10-digit US number.' }
  const only = (Deno.env.get('SMS_TEST_ONLY_TO') || '').split(',').map(digits10).filter(Boolean)
  if (only.length && !only.includes(digits10(dest))) {
    return { ok: false, error: 'Texting isn’t set up for everyone yet (test mode).' }
  }
  const profile = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID')
  let res: Response
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: dest, text,
        ...(profile ? { messaging_profile_id: profile } : {}),
        ...(opts.webhookUrl ? { webhook_url: opts.webhookUrl } : {}),
      }),
    })
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = data?.errors?.[0]
    return { ok: false, error: err?.detail || err?.title || `Telnyx ${res.status}` }
  }
  return { ok: true, id: data?.data?.id, status: statusFromTelnyx(data?.data?.to?.[0]?.status) || 'queued' }
}

// Has this number texted STOP (to us, ever)? Checked before every send.
export async function optedOut(supabase: any, phone: unknown): Promise<boolean> {
  const p = digits10(phone)
  if (!p) return false
  const { data } = await supabase.from('sms_opt_outs').select('phone').eq('phone', p).is('opted_in_at', null).limit(1)
  return !!data?.length
}

const b64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))

// Telnyx signs each webhook: ed25519 over "timestamp|raw body", with its public key.
export async function telnyxWebhookOk(raw: string, headers: Headers): Promise<boolean> {
  const sig = headers.get('telnyx-signature-ed25519')
  const ts = headers.get('telnyx-timestamp')
  const pub = Deno.env.get('TELNYX_PUBLIC_KEY')
  if (!sig || !ts || !pub) return false
  if (!Number.isFinite(Number(ts)) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  try {
    const key = await crypto.subtle.importKey('raw', b64(pub), { name: 'Ed25519' }, false, ['verify'])
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, b64(sig), new TextEncoder().encode(`${ts}|${raw}`))
  } catch {
    return false
  }
}
