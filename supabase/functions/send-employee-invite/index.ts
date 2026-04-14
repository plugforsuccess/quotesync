// supabase/functions/send-employee-invite/index.ts
// Sends a Supabase invite email to an employee, links the resulting auth user
// to the employees record, creates an agency_membership (role=employee), and
// seeds an agent_availability row.
//
// Authorization: only principals of the target agency may invoke this.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { employee_id, email, agency_id } = await req.json();

    if (!employee_id || !email || !agency_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Admin client — uses service role key
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Verify the requesting user is a principal of this agency
    const authHeader = req.headers.get('Authorization');
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader! } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: membership } = await admin
      .from('agency_memberships')
      .select('agency_role')
      .eq('user_id', user.id)
      .eq('agency_id', agency_id)
      .eq('status', 'active')
      .single();

    if (!membership || membership.agency_role !== 'principal') {
      return new Response(JSON.stringify({ error: 'Only principals can invite employees' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check if a Supabase auth user already exists with this email
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email === email);

    let authUserId: string;

    if (existing) {
      // User already has an auth account — just link it
      authUserId = existing.id;
    } else {
      // Send invite email — creates auth user + sends magic link
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${Deno.env.get('SITE_URL') ?? 'https://quotesync.app'}/my/queue`,
          data: {
            employee_id,
            agency_id,
            role: 'employee',
          },
        }
      );
      if (inviteError) throw inviteError;
      authUserId = invited.user!.id;
    }

    // Link auth_user_id to employee record
    const { error: linkError } = await admin
      .from('employees')
      .update({ auth_user_id: authUserId })
      .eq('id', employee_id)
      .eq('org_id', agency_id);

    if (linkError) throw linkError;

    // Create agency_membership for this employee (read-only agency access)
    await admin.from('agency_memberships').upsert({
      user_id: authUserId,
      agency_id,
      agency_role: 'employee',
      status: 'active',
    }, { onConflict: 'user_id,agency_id', ignoreDuplicates: true });

    // Seed agent_availability row (table has UNIQUE (agency_id, user_id))
    await admin.from('agent_availability').upsert({
      user_id: authUserId,
      agency_id,
      available: false,
      priority_tier: 1,
    }, { onConflict: 'agency_id,user_id', ignoreDuplicates: true });

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, already_existed: !!existing }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
