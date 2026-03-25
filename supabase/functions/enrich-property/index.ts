// supabase/functions/enrich-property/index.ts
// Fetches property data from Estated API for wizard prefill.
// Fires after address step — returns year_built, square_footage, stories.
// Failure is silent — frontend falls back to manual entry.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ESTATED_API_KEY = Deno.env.get('ESTATED_API_KEY') ?? '';
const ESTATED_BASE    = 'https://apis.estated.com/v4/property';

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { street_address, zip } = await req.json();

    if (!street_address || !zip) {
      return new Response(JSON.stringify({ error: 'Missing address or zip' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ESTATED_API_KEY) {
      return new Response(JSON.stringify({}), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const params = new URLSearchParams({
      token:          ESTATED_API_KEY,
      street_address: street_address,
      zip_code:       zip,
    });

    const res = await fetch(`${ESTATED_BASE}?${params}`);
    if (!res.ok) {
      return new Response(JSON.stringify({}), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();
    const structure = data?.data?.structure;

    if (!structure) {
      return new Response(JSON.stringify({}), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map stories: Estated returns a number, wizard uses string '1'/'1.5'/'2'/'2+'
    const rawStories = structure.stories;
    let stories: string | null = null;
    if (rawStories != null) {
      if (rawStories <= 1)       stories = '1';
      else if (rawStories < 2)   stories = '1.5';
      else if (rawStories === 2) stories = '2';
      else                       stories = '2+';
    }

    const result = {
      year_built:     structure.year_built     ?? null,
      square_footage: structure.total_area_sq_ft ?? null,
      stories,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    // Always return 200 with empty object — enrichment failure must be silent
    console.error('[enrich-property] error:', err);
    return new Response(JSON.stringify({}), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
