// Supabase Edge Function: dd-issue-certificate
// POST /functions/v1/dd-issue-certificate   (verify_jwt = true)
//
// For the caller's COMPLETED enrollment: generates the certificate PDF (once),
// stores it privately in the dd-certificates bucket, inserts dd_certificates
// (which fires the trigger that pushes the row into dd_discount_queue), and
// returns a short-lived signed download URL. Idempotent via the unique
// enrollment_id on dd_certificates — repeat calls just return a fresh URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import fontkit from 'https://esm.sh/@pdf-lib/fontkit@1.1.1'

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

const AGENCY_NAME = Deno.env.get('DD_AGENCY_NAME') || 'Insured by Cam — Wiley-Wilson Agency'
const BUCKET = 'dd-certificates'

// Best-effort email via Resend (scaffolded behind env vars; no-op if unset).
async function sendEmail(to: string[], subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('DD_EMAIL_FROM') || 'Insured by Cam <noreply@insuredbycam.com>'
  if (!key || to.length === 0) return
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!r.ok) console.error('resend email failed:', r.status, await r.text())
  } catch (e) { console.error('email error:', e?.message || e) }
}

function makeCertUid(): string {
  const year = new Date().getUTCFullYear()
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()
  return `GA-DD-${year}-${rand}`
}

function wrap(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const t = line ? `${line} ${w}` : w
    if (font.widthOfTextAtSize(t, size) > maxWidth && line) { lines.push(line); line = w }
    else line = t
  }
  if (line) lines.push(line)
  return lines
}

// The finished certificate template + name font are served as static assets; we
// fetch each once and overlay only the dynamic fields (student name + completion
// date). Falls back to a simple drawn certificate (and Times for the name) if
// the assets can't be fetched, so issuance never hard-fails.
const CERT_TEMPLATE_URL = Deno.env.get('DD_CERT_TEMPLATE_URL') ||
  'https://www.insuredbycam.com/quotesync-cert-sample-2.png'
const CERT_FONT_URL = Deno.env.get('DD_CERT_FONT_URL') ||
  'https://www.insuredbycam.com/EBGaramond-Bold.ttf'
const assetCache: Record<string, Uint8Array | null> = {}
async function fetchAsset(url: string): Promise<Uint8Array | null> {
  if (url in assetCache) return assetCache[url]
  try {
    const r = await fetch(url)
    assetCache[url] = r.ok ? new Uint8Array(await r.arrayBuffer()) : null
  } catch { assetCache[url] = null }
  return assetCache[url]
}

async function buildPdf(opts: {
  studentName: string; dln: string | null; courseTitle: string;
  completionDate: string; scorePct: number | null; certUid: string;
  complianceLabel: string; ddsProviderNo: string | null; isDdsApproved: boolean;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold)

  const tpl = await fetchAsset(CERT_TEMPLATE_URL)
  if (tpl) {
    // Overlay only the dynamic fields onto the QuoteSync template. Coordinates
    // are in the template's pixel space (1448x1086), mapped to a 792pt page.
    const png = await pdf.embedPng(tpl)
    const IW = png.width, IH = png.height, PW = 792, PH = Math.round(PW * IH / IW), k = PW / IW
    const page = pdf.addPage([PW, PH])
    page.drawImage(png, { x: 0, y: 0, width: PW, height: PH })
    const X = (px: number) => px * k, Y = (py: number) => PH - py * k

    // Student name — EB Garamond Bold, 44pt, indigo (fallback: Times Bold).
    let nameFont = serifB
    const fontBytes = await fetchAsset(CERT_FONT_URL)
    if (fontBytes) { try { nameFont = await pdf.embedFont(fontBytes) } catch { nameFont = serifB } }
    let ns = 44
    while (nameFont.widthOfTextAtSize(opts.studentName, ns) > 600 && ns > 20) ns -= 1
    const nw = nameFont.widthOfTextAtSize(opts.studentName, ns)
    page.drawText(opts.studentName, { x: PW / 2 - nw / 2, y: Y(498), size: ns, font: nameFont, color: rgb(0.294, 0, 0.510) })

    // Completion date on its line.
    page.drawText(opts.completionDate, { x: X(380), y: Y(890), size: 12, font: serif, color: rgb(0.12, 0.15, 0.25) })
    return await pdf.save()
  }

  // Fallback — a simple drawn certificate if the template asset is unavailable.
  const W = 792, H = 612
  const page = pdf.addPage([W, H])
  const navy = rgb(0.106, 0.165, 0.29), sub = rgb(0.25, 0.29, 0.4)
  const center = (text: string, y: number, font: any, size: number, color = navy) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (W - w) / 2, y, size, font, color })
  }
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: rgb(0.18, 0.43, 0.69), borderWidth: 2 })
  center('CERTIFICATE OF COMPLETION', 470, serifB, 30)
  center('This certifies that', 410, serif, 14, sub)
  center(opts.studentName, 366, serifB, 24, rgb(0.20, 0.31, 0.60))
  center('has successfully completed the', 322, serif, 14, sub)
  center('Georgia Defensive Driving Course (6 hours)', 286, serifB, 18)
  center(`Completion Date: ${opts.completionDate}`, 150, serif, 12, sub)
  center('QuoteSync — Course Provider', 120, serifB, 12)
  return await pdf.save()
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

    const body = await req.json().catch(() => ({}))
    const courseSlug = (body.course_slug || 'georgia-6hr-defensive-driving').toString()

    const { data: course } = await supabase
      .from('dd_courses')
      .select('id, title, is_dds_approved, compliance_label, dds_provider_no')
      .eq('slug', courseSlug).maybeSingle()
    if (!course) return json({ error: 'Course not found' }, 404)

    const { data: enr } = await supabase
      .from('dd_enrollments')
      .select('id, status, completed_at, student_name_snapshot, dln_snapshot')
      .eq('user_id', user.id).eq('course_id', course.id)
      .neq('status', 'expired').maybeSingle()
    if (!enr) return json({ error: 'No enrollment found' }, 404)
    if (enr.status !== 'completed') return json({ error: 'Course is not yet completed' }, 409)

    // Already issued? Return a fresh signed URL.
    const { data: existing } = await supabase
      .from('dd_certificates').select('certificate_uid, pdf_path').eq('enrollment_id', enr.id).maybeSingle()

    let certUid = existing?.certificate_uid as string | undefined
    let pdfPath = existing?.pdf_path as string | undefined
    let created = false
    const studentName = enr.student_name_snapshot || user.email || 'Student'

    if (!existing) {
      // Best passing score for the issued certificate.
      const { data: best } = await supabase
        .from('dd_exam_attempts')
        .select('score_pct').eq('enrollment_id', enr.id).eq('passed', true)
        .order('score_pct', { ascending: false }).limit(1).maybeSingle()

      certUid = makeCertUid()
      pdfPath = `${user.id}/${certUid}.pdf`

      const bytes = await buildPdf({
        studentName,
        dln: enr.dln_snapshot,
        courseTitle: course.title,
        completionDate: new Date(enr.completed_at || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
        scorePct: best?.score_pct ?? null,
        certUid,
        complianceLabel: course.compliance_label,
        ddsProviderNo: course.dds_provider_no,
        isDdsApproved: course.is_dds_approved,
      })

      const up = await supabase.storage.from(BUCKET).upload(pdfPath, bytes, {
        contentType: 'application/pdf', upsert: true,
      })
      if (up.error) throw up.error

      const ins = await supabase.from('dd_certificates').insert({
        enrollment_id: enr.id,
        certificate_uid: certUid,
        pdf_path: pdfPath,
        score_pct: best?.score_pct ?? null,
        student_name_snapshot: enr.student_name_snapshot,
        dln_snapshot: enr.dln_snapshot,
      }).select('certificate_uid, pdf_path').single()

      if (ins.error) {
        // Concurrent insert — fall back to the existing row.
        const { data: row } = await supabase
          .from('dd_certificates').select('certificate_uid, pdf_path').eq('enrollment_id', enr.id).maybeSingle()
        if (!row) throw ins.error
        certUid = row.certificate_uid; pdfPath = row.pdf_path
      } else {
        created = true
      }
    }

    // Notifications on first issuance only (best-effort, never block issuance).
    if (created) {
      const base = (Deno.env.get('SITE_URL') || 'https://insuredbycam.com').replace(/\/$/, '')
      const portal = `${base}/courses/defensive-driving/portal`
      if (user.email) {
        await sendEmail([user.email], 'Your certificate is ready',
          `<p>Hi ${studentName},</p>` +
          `<p>Your <strong>${course.title}</strong> certificate of completion is ready. ` +
          `<a href="${portal}">Download it here</a>.</p>` +
          `<p>A copy has been forwarded to the agency for your insurance discount review.</p>`)
      }
      const staffTo = (Deno.env.get('DD_STAFF_NOTIFY_EMAILS') || '').split(',').map((s) => s.trim()).filter(Boolean)
      if (staffTo.length) {
        await sendEmail(staffTo, 'New defensive-driving certificate in the queue',
          `<p>A new certificate (<strong>${certUid}</strong>) for ${studentName} has been added to the ` +
          `Defensive Drivers Discount List.</p>`)
      }
    }

    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET).createSignedUrl(pdfPath!, 600) // 10 minutes
    if (signErr) throw signErr

    return json({ certificate_uid: certUid, url: signed.signedUrl })
  } catch (err) {
    console.error('dd-issue-certificate error:', err?.message || err)
    return json({ error: 'Could not issue certificate.' }, 500)
  }
})
