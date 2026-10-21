// Supabase Edge Function: rate-check-cleanup
// POST /functions/v1/rate-check-cleanup   (verify_jwt = false — invoked daily by pg_cron)
//
// Retention: dec-page images are deleted 90 days after the rate check was
// received, and rate_checks.image_path is nulled. The extracted policy data is
// kept. Storage objects can't be deleted with SQL (storage.protect_delete), so
// this goes through the Storage API with the service role.
//
// Takes no input and only ever deletes images past the retention window, so an
// unauthenticated call is harmless (idempotent); that lets pg_cron invoke it
// without a secret stored in the database.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'dec-pages'
const RETENTION_DAYS = 90
const BATCH = 100

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()

  let deleted = 0
  try {
    // Bounded loop so one run can't spin forever if deletes keep failing.
    for (let i = 0; i < 50; i++) {
      const { data: rows, error } = await supabase
        .from('rate_checks')
        .select('id, image_path')
        .not('image_path', 'is', null)
        .lt('created_at', cutoff)
        .limit(BATCH)
      if (error) throw error
      if (!rows || rows.length === 0) break

      const paths = rows.map(r => r.image_path as string)
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths)
      if (rmErr) throw rmErr

      const { error: updErr } = await supabase
        .from('rate_checks')
        .update({ image_path: null })
        .in('id', rows.map(r => r.id))
      if (updErr) throw updErr

      deleted += rows.length
      if (rows.length < BATCH) break
    }

    if (deleted > 0) {
      await supabase.from('audit_log').insert({
        event_type: 'RATE_CHECK_IMAGES_PURGED',
        metadata: { deleted, cutoff, retention_days: RETENTION_DAYS },
      })
    }
    console.log(`[RATE_CHECK_CLEANUP] purged ${deleted} dec-page image(s) older than ${cutoff}`)
    return new Response(JSON.stringify({ deleted, cutoff }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[RATE_CHECK_CLEANUP] Error:', error)
    return new Response(JSON.stringify({ error: (error as Error).message, deleted }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
