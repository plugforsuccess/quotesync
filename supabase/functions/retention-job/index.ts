// Supabase Edge Function: retention-job
// Scheduled job to anonymize leads past retention threshold
// Trigger via cron: 0 3 * * * (daily at 3am)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Configurable retention periods (days)
const LEAD_PII_RETENTION_DAYS = parseInt(Deno.env.get('LEAD_PII_RETENTION_DAYS') || '90')
const DRY_RUN = Deno.env.get('RETENTION_DRY_RUN') === 'true'

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Call the anonymization function from migration 015
    const { data, error } = await supabase.rpc('anonymize_expired_leads', {
      p_pii_retention_days: LEAD_PII_RETENTION_DAYS,
      p_dry_run: DRY_RUN
    })

    if (error) {
      console.error('Retention job failed:', error)
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const result = data?.[0] || { anonymized_count: 0, lead_ids: [] }

    console.log(`Retention job completed: ${result.anonymized_count} leads anonymized (dry_run: ${DRY_RUN})`)

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: DRY_RUN,
        retention_days: LEAD_PII_RETENTION_DAYS,
        anonymized_count: result.anonymized_count
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (err) {
    console.error('Retention job error:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
