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

// Fixed course line on the certificate (matches the approved layout).
const COURSE_LINE = 'Georgia Defensive Driving Course (6 hours)'

async function buildPdf(opts: {
  studentName: string; dln: string | null; courseTitle: string;
  completionDate: string; scorePct: number | null; certUid: string;
  complianceLabel: string; ddsProviderNo: string | null; isDdsApproved: boolean;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([792, 612]) // US Letter, landscape
  const W = 792, H = 612
  const serif = await pdf.embedFont(StandardFonts.TimesRoman)
  const serifB = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvB = await pdf.embedFont(StandardFonts.HelveticaBold)

  const ink = rgb(0.07, 0.07, 0.07)
  const sub = rgb(0.25, 0.25, 0.25)
  const green = rgb(0.122, 0.62, 0.408)
  const keyline = rgb(0.17, 0.275, 0.21)
  const gray = rgb(0.42, 0.45, 0.50)
  const badgeGreen = rgb(0.063, 0.725, 0.506)
  const white = rgb(1, 1, 1)

  const center = (text: string, y: number, font: any, size: number, color = ink) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (W - w) / 2, y, size, font, color })
  }

  // --- Ornate green border band (to the edge), bounded by a dark keyline ---
  page.drawRectangle({ x: 12, y: 12, width: W - 24, height: H - 24, borderColor: green, borderWidth: 1.2 })
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: keyline, borderWidth: 1.5 })

  const inset = 23, step = 26
  const drawDiamond = (cx: number, cy: number, r: number) => {
    const p = [[cx, cy + r], [cx + r, cy], [cx, cy - r], [cx - r, cy]]
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4]
      page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: 0.9, color: green })
    }
  }
  const motif = (cx: number, cy: number) => { drawDiamond(cx, cy, 7); drawDiamond(cx, cy, 3.6); page.drawCircle({ x: cx, y: cy, size: 1.1, color: green }) }
  for (let x = inset; x <= W - inset + 0.1; x += step) { motif(x, H - inset); motif(x, inset) }
  for (let y = inset + step; y <= H - inset - step + 0.1; y += step) { motif(inset, y); motif(W - inset, y) }

  // --- Body text (serif, like the NHSA certificate) ---
  center('CERTIFICATE OF COMPLETION', 462, serif, 31)
  center('This certifies that', 402, serif, 14, sub)
  center(opts.studentName, 360, serifB, 22)
  center('has completed the course for', 318, serif, 14, sub)
  center(COURSE_LINE, 280, serifB, 17)

  // Completion date (bottom-left)
  const dl = 'Completion Date: '
  page.drawText(dl, { x: 70, y: 150, size: 12, font: serif, color: sub })
  page.drawText(opts.completionDate, { x: 70 + serif.widthOfTextAtSize(dl, 12), y: 150, size: 12, font: serif, color: ink })

  // --- insuredbycam brand mark (bottom-right) ---
  const bx = 548, by = 128, bs = 42
  page.drawRectangle({ x: bx, y: by, width: bs, height: bs, color: badgeGreen })
  const s = bs / 24
  const pt = (px: number, py: number) => ({ x: bx + px * s, y: by + bs - py * s }) // top-down -> pdf coords
  page.drawLine({ start: pt(5, 13), end: pt(9, 17), thickness: 3.2, color: white })
  page.drawLine({ start: pt(9, 17), end: pt(19, 7), thickness: 3.2, color: white })
  page.drawText('insuredbycam', { x: bx + bs + 10, y: by + bs / 2 - 7, size: 18, font: helvB, color: ink })

  // --- Compliance + certificate id (bottom strip) ---
  const cl = wrap(opts.complianceLabel, helv, 8.5, W - 220)
  let cy = 82
  for (const ln of cl) { center(ln, cy, helv, 8.5, gray); cy -= 11 }
  const idLine = `Certificate ID: ${opts.certUid}` + (opts.dln ? `   ·   DL: ${opts.dln}` : '')
  center(idLine, cy - 1, helv, 8.5, gray)

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
