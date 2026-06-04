// Supabase Edge Function: dd-create-checkout
// POST /functions/v1/dd-create-checkout
// Auth: requires a signed-in user (verify_jwt = true).
//
// Collects + validates the student's legal identity, snapshots it onto a
// pending_payment dd_enrollments row, and creates a Stripe Checkout Session
// priced from dd_courses.price_cents. Returns the hosted checkout URL.
// The webhook (dd-stripe-webhook) flips the enrollment to 'active' on payment.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

// Inline CORS (no _shared import — matches the user-facing function convention).
const allowedOrigins = [
  'https://insuredbycam.com',
  'https://www.insuredbycam.com',
  'https://quotesync.vercel.app',
]
const envOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN')
if (envOrigin && !allowedOrigins.includes(envOrigin)) allowedOrigins.push(envOrigin)
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || ''
  const isAllowed = allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')
  const matched = isAllowed ? origin : allowedOrigins[0]
  return {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// ---- validation helpers -----------------------------------------------------
function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().replace(/\s+/g, ' ')
  if (s.length < 2 || s.length > 120) return null
  if (!/[A-Za-z]/.test(s)) return null
  return s
}
function cleanDln(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim().toUpperCase()
  if (!/^[A-Z0-9]{5,20}$/.test(s)) return null
  return s
}
// Returns ISO date string if valid and age in [15,110], else null.
function cleanDob(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getUTCFullYear() - d.getUTCFullYear()
  const mo = now.getUTCMonth() - d.getUTCMonth()
  if (mo < 0 || (mo === 0 && now.getUTCDate() < d.getUTCDate())) age--
  if (age < 15 || age > 110) return null
  return v.trim()
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || SERVICE_KEY
  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')

  // Identify the caller from their JWT.
  const authHeader = req.headers.get('Authorization') || ''
  const userToken = authHeader.replace('Bearer ', '')
  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${userToken}` } },
  })
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY) // service role for writes

  try {
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const payload = await req.json().catch(() => ({}))
    const courseSlug: string = (payload.course_slug || 'georgia-6hr-defensive-driving').toString()

    const studentName = cleanName(payload.student_name)
    const dln = cleanDln(payload.dln)
    const dob = cleanDob(payload.dob)
    if (!studentName) return json({ error: 'A valid legal name is required.' }, 400)
    if (!dln) return json({ error: 'A valid driver license number is required.' }, 400)
    if (!dob) return json({ error: 'A valid date of birth is required (must be 15 or older).' }, 400)

    // Course must exist and be active.
    const { data: course, error: courseErr } = await supabase
      .from('dd_courses')
      .select('id, slug, title, price_cents, currency, is_active, allow_test_bypass')
      .eq('slug', courseSlug)
      .maybeSingle()
    if (courseErr) throw courseErr
    if (!course || !course.is_active) return json({ error: 'Course not available.' }, 404)
    if (!course.price_cents || course.price_cents <= 0) return json({ error: 'Course is not purchasable.' }, 400)

    // Reuse an existing non-expired enrollment, or create a pending one.
    const { data: existing } = await supabase
      .from('dd_enrollments')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('course_id', course.id)
      .neq('status', 'expired')
      .maybeSingle()

    if (existing && (existing.status === 'active' || existing.status === 'completed')) {
      return json({ error: 'You already have access to this course.', already_enrolled: true }, 409)
    }

    let enrollmentId: string
    if (existing) {
      enrollmentId = existing.id
      const { error: updErr } = await supabase
        .from('dd_enrollments')
        .update({
          student_name_snapshot: studentName,
          dln_snapshot: dln,
          dob_snapshot: dob,
        })
        .eq('id', enrollmentId)
      if (updErr) throw updErr
    } else {
      const { data: ins, error: insErr } = await supabase
        .from('dd_enrollments')
        .insert({
          user_id: user.id,
          course_id: course.id,
          status: 'pending_payment',
          student_name_snapshot: studentName,
          dln_snapshot: dln,
          dob_snapshot: dob,
        })
        .select('id')
        .single()
      if (insErr) throw insErr
      enrollmentId = ins.id
    }

    const base = (Deno.env.get('SITE_URL') || req.headers.get('origin') || 'https://insuredbycam.com').replace(/\/$/, '')

    // TEST BYPASS: activate without payment when enabled on the course.
    if (course.allow_test_bypass) {
      await supabase
        .from('dd_enrollments')
        .update({ status: 'active', purchased_at: new Date().toISOString() })
        .eq('id', enrollmentId)
        .neq('status', 'completed')
      console.warn(`dd-create-checkout: TEST BYPASS activated enrollment ${enrollmentId} (no payment)`)
      return json({ url: `${base}/courses/defensive-driving/success?bypass=1`, enrollment_id: enrollmentId, bypass: true })
    }

    if (!STRIPE_SECRET_KEY) return json({ error: 'Payments are not configured' }, 503)

    // Build success/cancel URLs.
    const successUrl = `${base}/courses/defensive-driving/success?session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${base}/courses/defensive-driving?canceled=1`

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: enrollmentId,
      customer_email: user.email ?? undefined,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: course.currency || 'usd',
          unit_amount: course.price_cents,
          product_data: { name: course.title },
        },
      }],
      metadata: {
        enrollment_id: enrollmentId,
        course_id: course.id,
        user_id: user.id,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    })

    // Record the session id so the webhook can reconcile and the client can poll.
    await supabase
      .from('dd_enrollments')
      .update({ stripe_session_id: session.id })
      .eq('id', enrollmentId)

    return json({ url: session.url, enrollment_id: enrollmentId })
  } catch (err) {
    console.error('dd-create-checkout error:', err?.message || err)
    return json({ error: 'Could not start checkout. Please try again.' }, 500)
  }
})
