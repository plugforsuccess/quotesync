// Supabase Edge Function: dd-stripe-webhook
// POST /functions/v1/dd-stripe-webhook
// Public (verify_jwt = false) — authenticated via the Stripe-Signature header.
//
// On checkout.session.completed (paid), flips the matching dd_enrollments row
// from 'pending_payment' to 'active' and stamps purchased_at. Idempotent: the
// status guard means redelivered events do not re-process.
//
// A full refund (charge.refunded) or a chargeback (charge.dispute.created) ends
// course access and voids the certificate: the enrollment becomes 'refunded' or
// 'disputed', its certificate is revoked, and its discount-queue row is archived.
// A dispute the agency wins (charge.dispute.closed, status 'won') restores both.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const cryptoProvider = Stripe.createSubtleCryptoProvider()

type Db = ReturnType<typeof createClient>

// The enrollment a charge or dispute belongs to, found through its Checkout Session.
async function enrollmentFor(stripe: Stripe, supabase: Db, paymentIntent: unknown): Promise<string | null> {
  const pi = typeof paymentIntent === 'string' ? paymentIntent : (paymentIntent as { id?: string } | null)?.id
  if (!pi) return null
  const { data: sessions } = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 })
  const session = sessions[0]
  if (!session) return null
  const id = session.metadata?.enrollment_id || session.client_reference_id
  if (id) return id
  const { data } = await supabase.from('dd_enrollments').select('id').eq('stripe_session_id', session.id).maybeSingle()
  return (data?.id as string) ?? null
}

// Ends access and voids the certificate. Safe to repeat.
async function revoke(supabase: Db, enrollmentId: string, status: 'refunded' | 'disputed') {
  const now = new Date().toISOString()
  const { error } = await supabase.from('dd_enrollments').update({ status }).eq('id', enrollmentId).neq('status', 'expired')
  if (error) throw error
  const { error: certErr } = await supabase.from('dd_certificates')
    .update({ revoked_at: now, revoked_reason: status }).eq('enrollment_id', enrollmentId).is('revoked_at', null)
  if (certErr) throw certErr
  const { data: rows } = await supabase.from('dd_discount_queue').select('id, notes').eq('enrollment_id', enrollmentId).neq('status', 'archived')
  for (const row of rows || []) {
    const note = `Certificate void: payment ${status} ${now.slice(0, 10)}.`
    await supabase.from('dd_discount_queue')
      .update({ status: 'archived', notes: row.notes ? `${row.notes}\n${note}` : note }).eq('id', row.id)
  }
  console.log(`dd-stripe-webhook: ${status} enrollment ${enrollmentId}; certificate revoked`)
}

// A dispute the agency won: access and the certificate come back.
async function restore(supabase: Db, enrollmentId: string) {
  const { data: enr } = await supabase.from('dd_enrollments').select('status, completed_at').eq('id', enrollmentId).maybeSingle()
  if (enr?.status !== 'disputed') return
  await supabase.from('dd_enrollments').update({ status: enr.completed_at ? 'completed' : 'active' }).eq('id', enrollmentId)
  await supabase.from('dd_certificates').update({ revoked_at: null, revoked_reason: null })
    .eq('enrollment_id', enrollmentId).eq('revoked_reason', 'disputed')
  console.log(`dd-stripe-webhook: dispute won, restored enrollment ${enrollmentId}`)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')
  const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!STRIPE_SECRET_KEY || !WEBHOOK_SECRET) {
    console.error('dd-stripe-webhook: missing Stripe env configuration')
    return new Response('Not configured', { status: 503 })
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

  const signature = req.headers.get('Stripe-Signature')
  const body = await req.text()
  if (!signature) return new Response('Missing signature', { status: 400 })

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch (err) {
    console.error('dd-stripe-webhook: signature verification failed:', err?.message || err)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid') {
        const enrollmentId = session.metadata?.enrollment_id || session.client_reference_id
        if (enrollmentId) {
          // Guarded update => idempotent (only flips pending_payment -> active).
          const { data, error } = await supabase
            .from('dd_enrollments')
            .update({
              status: 'active',
              purchased_at: new Date().toISOString(),
              stripe_session_id: session.id,
            })
            .eq('id', enrollmentId)
            .eq('status', 'pending_payment')
            .select('id')
          if (error) throw error
          console.log(`dd-stripe-webhook: activated enrollment ${enrollmentId} (rows=${data?.length ?? 0})`)
        } else {
          console.warn('dd-stripe-webhook: checkout.session.completed without enrollment_id')
        }
      }
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as Stripe.Charge
      // Only a full refund ends access; a partial refund is a goodwill credit.
      if (charge.refunded) {
        const id = await enrollmentFor(stripe, supabase, charge.payment_intent)
        if (id) await revoke(supabase, id, 'refunded')
        else console.warn(`dd-stripe-webhook: no enrollment for refunded charge ${charge.id}`)
      }
    } else if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object as Stripe.Dispute
      const id = await enrollmentFor(stripe, supabase, dispute.payment_intent)
      if (id) await revoke(supabase, id, 'disputed')
      else console.warn(`dd-stripe-webhook: no enrollment for dispute ${dispute.id}`)
    } else if (event.type === 'charge.dispute.closed') {
      const dispute = event.data.object as Stripe.Dispute
      if (dispute.status === 'won') {
        const id = await enrollmentFor(stripe, supabase, dispute.payment_intent)
        if (id) await restore(supabase, id)
      }
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('dd-stripe-webhook: handler error:', err?.message || err)
    // 500 so Stripe retries.
    return new Response('Handler error', { status: 500 })
  }
})
