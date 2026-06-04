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

async function buildPdf(opts: {
  studentName: string; dln: string | null; courseTitle: string;
  completionDate: string; scorePct: number | null; certUid: string;
  complianceLabel: string; ddsProviderNo: string | null; isDdsApproved: boolean;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([792, 612]) // US Letter, landscape
  const W = 792, H = 612
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.09, 0.11, 0.15)
  const green = rgb(0.10, 0.55, 0.36)
  const gray = rgb(0.40, 0.44, 0.50)

  const center = (text: string, y: number, font: any, size: number, color = ink) => {
    const w = font.widthOfTextAtSize(text, size)
    page.drawText(text, { x: (W - w) / 2, y, size, font, color })
  }

  // Borders
  page.drawRectangle({ x: 24, y: 24, width: W - 48, height: H - 48, borderColor: green, borderWidth: 3 })
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: rgb(0.85, 0.88, 0.86), borderWidth: 1 })

  center(AGENCY_NAME, H - 90, bold, 16, green)
  center('CERTIFICATE OF COMPLETION', H - 140, bold, 30, ink)
  center('Defensive Driving', H - 168, helv, 14, gray)

  center('This certifies that', H - 220, helv, 13, gray)
  center(opts.studentName, H - 262, bold, 28, ink)
  center('has successfully completed', H - 300, helv, 13, gray)
  center(opts.courseTitle, H - 332, bold, 18, ink)
  center('6.0 hours of instruction', H - 356, helv, 12, gray)

  const detail = `Completion date: ${opts.completionDate}` +
    (opts.scorePct != null ? `     Final score: ${opts.scorePct}%` : '')
  center(detail, H - 392, helv, 12, ink)

  if (opts.isDdsApproved && opts.ddsProviderNo) {
    center(`DDS Provider No: ${opts.ddsProviderNo}`, H - 414, helv, 11, ink)
  }

  // Compliance text (wrapped), bottom
  const cl = wrap(opts.complianceLabel, helv, 9, W - 160)
  let cy = 96
  for (const ln of cl) { center(ln, cy, helv, 9, gray); cy -= 12 }

  // Footer meta
  page.drawText(`Certificate ID: ${opts.certUid}`, { x: 48, y: 50, size: 9, font: helv, color: gray })
  if (opts.dln) {
    const dlnText = `DL: ${opts.dln}`
    page.drawText(dlnText, { x: W - 48 - helv.widthOfTextAtSize(dlnText, 9), y: 50, size: 9, font: helv, color: gray })
  }

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
