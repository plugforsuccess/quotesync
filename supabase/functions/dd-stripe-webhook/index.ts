// Supabase Edge Function: dd-stripe-webhook
// POST /functions/v1/dd-stripe-webhook
// Public (verify_jwt = false) — authenticated via the Stripe-Signature header.
//
// On checkout.session.completed (paid), flips the matching dd_enrollments row
// from 'pending_payment' to 'active' and stamps purchased_at. Idempotent: the
// status guard means redelivered events do not re-process.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const cryptoProvider = Stripe.createSubtleCryptoProvider()

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
