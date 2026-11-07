// supabase/functions/_shared/email.ts
// One look for every email the app sends: a navy band with the agency seal, the message
// on white, the main link as a gold button, and a footer (agency name, mailing address
// from the Texts & Scripts page, and an unsubscribe link on reminders). Pure apart from
// sendEmail/loadEmailCopy, so it's unit-tested (tests/unit/emailTemplates.test.mjs).
// Sent through Resend (RESEND_API_KEY) from EMAIL_FROM, else Cam Wiley Agency.
import { EMAIL_TEMPLATES, type EmailTemplate } from './emailTemplates.ts'

export const AGENCY = 'Cam Wiley Agency'
export const DEFAULT_FROM = 'Cam Wiley Agency <noreply@insuredbycam.com>'
export const ADDRESS_KEY = 'email.footer.address'
const SITE = 'https://insuredbycam.com'
const NAVY = '#0F2D6B'
const GOLD = '#F5D061'
const INK = '#1E293B'
const MUTED = '#64748B'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** The saved wording for a template (site_copy rows win over the defaults). */
export function resolveTemplate(t: EmailTemplate, saved: Record<string, string>) {
  const get = (k: string, d: string) => (saved[k] ?? '').trim() || d
  return {
    subject: get(`${t.key}.subject`, t.subject),
    paragraphs: t.paragraphs.map((p, i) => get(`${t.key}.${i + 1}`, p)).filter(p => p.trim()),
    buttonLabel: t.button ? get(`${t.key}.button`, t.button.label) : '',
  }
}

const fillBlanks = (s: string, vars: Record<string, string>) =>
  s.replace(/\[([a-z ]+)\]/gi, (m, k) => vars[k.toLowerCase()] ?? m)

export type RenderInput = {
  template: EmailTemplate
  saved: Record<string, string> // site_copy rows (key → value)
  vars: Record<string, string> // blanks, lower case: { 'first name': 'Dana', 'course link': 'https://…' }
  unsubscribeUrl?: string
}

/** Subject, HTML and plain text for one email. */
export function renderEmail({ template: t, saved, vars, unsubscribeUrl }: RenderInput) {
  const r = resolveTemplate(t, saved)
  const subject = fillBlanks(r.subject, vars).replace(/\s+/g, ' ').trim()
  const paragraphs = r.paragraphs.map(p => fillBlanks(p, vars))
  const buttonUrl = t.button ? vars[t.button.link] || '' : ''
  // An edit that dropped the link still gets the button (and the plain-text link).
  if (buttonUrl && !paragraphs.some(p => p.includes(buttonUrl))) paragraphs.push(buttonUrl)
  const address = (saved[ADDRESS_KEY] ?? '').trim()

  // Plain text: the paragraphs as written, then the footer.
  const textFooter = [AGENCY, address].filter(Boolean).join('\n')
  const text = [
    ...paragraphs,
    textFooter,
    ...(unsubscribeUrl ? [`Don't want these reminders? Unsubscribe: ${unsubscribeUrl}`] : []),
  ].join('\n\n')

  // HTML: the button replaces its link where the paragraph mentions it; other links stay links.
  const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, u => `<a href="${u}" style="color:${NAVY};font-weight:600">${u}</a>`)
  const button = buttonUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr><td style="border-radius:999px;background:${GOLD}">` +
      `<a href="${esc(buttonUrl)}" style="display:inline-block;padding:13px 26px;font-size:16px;font-weight:700;color:${NAVY};text-decoration:none;border-radius:999px">${esc(r.buttonLabel)}</a>` +
      `</td></tr></table>`
    : ''
  let placed = false
  const body = paragraphs.map(p => {
    if (buttonUrl && !placed && p.includes(buttonUrl)) {
      placed = true
      const rest = p.replace(buttonUrl, '').replace(/[\s:–—-]+$/, '').trim()
      return (rest ? `<p style="margin:0 0 14px">${linkify(rest)}${/[.!?]$/.test(rest) ? '' : '.'}</p>` : '') + button
    }
    return `<p style="margin:0 0 14px">${linkify(p)}</p>`
  }).join('')

  const preheader = esc(paragraphs.find(p => !/^(hi|hello|hey)\b/i.test(p)) || '').slice(0, 140)
  const footer = [
    `<p style="margin:0 0 4px;font-weight:600;color:${NAVY}">${AGENCY} · Allstate Insurance</p>`,
    address ? `<p style="margin:0 0 4px">${esc(address).replace(/\n/g, '<br>')}</p>` : '',
    `<p style="margin:0"><a href="${SITE}" style="color:${MUTED}">insuredbycam.com</a></p>`,
    unsubscribeUrl ? `<p style="margin:12px 0 0">Don’t want these reminders? <a href="${esc(unsubscribeUrl)}" style="color:${MUTED}">Unsubscribe</a>.</p>` : '',
  ].join('')

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#EEF2F8">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#EEF2F8"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;border-radius:14px;overflow:hidden;background:#FFFFFF">` +
    `<tr><td style="background:${NAVY};padding:18px 24px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    `<td style="padding-right:12px"><img src="${SITE}/brand/cw-seal-email.png" width="44" height="44" alt="" style="display:block;border:0"></td>` +
    `<td style="font-family:Georgia,'Times New Roman',serif;font-size:21px;font-weight:700;color:#FFFFFF">${AGENCY}</td>` +
    `</tr></table></td></tr>` +
    `<tr><td style="padding:28px 24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${INK}">${body}</td></tr>` +
    `<tr><td style="padding:16px 24px 24px;border-top:1px solid #E2E8F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${MUTED}">${footer}</td></tr>` +
    `</table></td></tr></table></body></html>`

  return { subject, html, text }
}

/** Every saved email.* row, for renderEmail's `saved`. */
export async function loadEmailCopy(supabase: any): Promise<Record<string, string>> {
  const { data } = await supabase.from('site_copy').select('key, value').like('key', 'email.%')
  return Object.fromEntries((data || []).map((r: any) => [r.key, String(r.value ?? '')]))
}

/** Send through Resend. Returns ok:false (never throws) when it isn't set up or fails. */
export async function sendEmail(msg: { to: string[]; subject: string; html: string; text: string; headers?: Record<string, string> }) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'Email is not set up (RESEND_API_KEY).' }
  const from = Deno.env.get('EMAIL_FROM') || DEFAULT_FROM
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, ...msg }),
    })
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

export { EMAIL_TEMPLATES }
