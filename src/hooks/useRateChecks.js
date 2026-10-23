// src/hooks/useRateChecks.js
// React Query hooks for the Rate Checks inbox (/agency/leads/rate-checks).
// Rows land via the public rate-check edge function; agents correct the
// extraction here and enter the Allstate quote through rate-check-outcome.

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';
import { prepareDecPage } from '../lib/rateCheckApi';

export const RATE_CHECK_LIST_COLUMNS = `
  id, agency_id, lead_id, created_at, first_name, phone, zip, status,
  carrier, policy_type, current_premium, term_months, annual_premium,
  allstate_premium, delta, delta_pct, extract_confidence, extract_error,
  image_path, image_media_type, policy_number, policy_number_last4, term_source, effective_date,
  expiration_date, vehicle_count, driver_count, vehicles, coverages,
  insured_address, extracted, quote_note, quoted_at, outcome_at,
  competitor_agent_id, current_agent, referral_consent_given_at, upload_source, consent_given_at,
  decision, decision_carrier, decision_reasons, decision_questions, decided_at,
  invite_id, producer_id, producer_name, event_name, carrier_raw,
  bound_carrier, bound_premium, bound_at, housing_situation, drivers, surcharges, claims, property, endorsements, summary,
  duplicate_of, resubmitted_at, resubmit_count, email, promoter_id
`;

const notified = new Set(); // rate check ids already announced on this device

// Rate checks for an agency, newest first. `statuses` empty/undefined = all.
// Duplicates (the same policy sent again) are folded into the original and hidden.
// Subscribes to realtime changes so new uploads appear without a refresh.
export const useRateChecks = (agencyId, statuses) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!agencyId) return;
    const channel = supabase
      .channel(`rate-checks-${agencyId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'rate_checks',
        filter: `agency_id=eq.${agencyId}`,
      }, (payload) => {
        queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
        // Heads-up on this device when a new one has been read (only if the agent allowed it).
        // Fires once the scan finishes — by then a policy sent twice is already marked as a
        // duplicate and stays quiet. Rescans of older rows don't re-notify.
        const r = payload.new || {};
        const fresh = r.created_at && Date.now() - new Date(r.created_at).getTime() < 5 * 60 * 1000;
        if (payload.eventType === 'UPDATE' && fresh && !r.duplicate_of && ['extracted', 'extract_failed'].includes(r.status)
          && !notified.has(r.id) && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          notified.add(r.id);
          try { new Notification('New rate check', { body: `${r.first_name || 'Someone'}${r.event_name ? ` · ${r.event_name}` : ''} just sent a policy`, tag: `rc-${r.id}` }); } catch { /* ignore */ }
        }
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [agencyId, queryClient]);

  return useQuery({
    queryKey: queryKeys.rateChecks.list(agencyId, statuses),
    queryFn: async () => {
      let query = supabase
        .from('rate_checks')
        .select(RATE_CHECK_LIST_COLUMNS)
        .eq('agency_id', agencyId)
        .is('duplicate_of', null) // a policy sent twice shows once
        .order('created_at', { ascending: false })
        .limit(500);
      if (statuses?.length) query = query.in('status', statuses);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

// 60-minute signed URL for the dec-page image (storage RLS limits this to the
// row's agency).
export const useRateCheckImageUrl = (imagePath) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.image(imagePath),
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('dec-pages')
        .createSignedUrl(imagePath, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!imagePath,
    staleTime: 50 * 60 * 1000, // refresh before the 60-min URL expires
  });
};

// Agent corrections to the extracted fields. annual_premium is recomputed
// from the term premium + term here so the trigger re-scores any quote.
export const useUpdateRateCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { data, error } = await supabase
        .from('rate_checks')
        .update(updates)
        .eq('id', id)
        .select(RATE_CHECK_LIST_COLUMNS)
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// Enter the Allstate quote → rate-check-outcome (won/lost, lead update, SMS).
export const useEnterRateCheckQuote = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rateCheckId, allstatePremium, quoteNote }) => {
      const { data, error } = await supabase.functions.invoke('rate-check-outcome', {
        body: { rate_check_id: rateCheckId, allstate_premium: allstatePremium, quote_note: quoteNote || null },
      });
      if (error) {
        // FunctionsHttpError carries the JSON body on .context
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* keep default */ }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
    },
  });
};

export const useRateCheckWinMap = (agencyId) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.winMap(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_win_map')
        .select('carrier, policy_type, zip5, quoted, wins, win_rate_pct, avg_savings_when_won')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

/** annual = term premium × 12 / term months (term null → as printed). */
export function annualize(premium, termMonths) {
  if (premium == null || premium === '') return null;
  const p = Number(premium);
  if (!Number.isFinite(p)) return null;
  const t = Number(termMonths);
  return t > 0 ? Math.round(p * (12 / t) * 100) / 100 : p;
}

// ── Competing agents (internal market intel) ─────────────────────────────────

export const useCompetitorAgents = (agencyId) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.competitors(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('competitor_agent_stats')
        .select('*')
        .eq('agency_id', agencyId)
        .order('rate_checks', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

// Agents can only change the watchlist fields (column grants enforce this).
export const useUpdateCompetitorAgent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const allowed = {};
      for (const k of ['starred', 'notes', 'book_ownership']) if (k in updates) allowed[k] = updates[k];
      const { error } = await supabase
        .from('competitor_agents')
        .update({ ...allowed, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// ── Referral partners + referrals (customer opt-in only) ─────────────────────

export const useReferralPartners = (agencyId) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.partners(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referral_partners')
        .select('id, name, contact_name, phone, email, lines, notes, active, created_at')
        .eq('agency_id', agencyId)
        .order('active', { ascending: false })
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });
};

export const useSaveReferralPartner = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId, values }) => {
      const row = { ...values, updated_at: new Date().toISOString() };
      const { error } = id
        ? await supabase.from('referral_partners').update(row).eq('id', id)
        : await supabase.from('referral_partners').insert({ ...row, agency_id: agencyId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

export const useReferrals = (rateCheckId) => {
  return useQuery({
    queryKey: queryKeys.rateChecks.referrals(rateCheckId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('referrals')
        .select('id, line, note, created_at, referral_partners(name)')
        .eq('rate_check_id', rateCheckId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!rateCheckId,
  });
};

// The DB trigger rejects this unless the customer opted in to referrals.
export const useCreateReferral = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, rateCheckId, leadId, partnerId, line, note }) => {
      const { error } = await supabase.from('referrals').insert({
        agency_id: agencyId, rate_check_id: rateCheckId, lead_id: leadId || null,
        partner_id: partnerId, line: line || null, note: note || null,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// Staff upload: a dec page a customer emailed/texted in. Runs the same scan via
// the rate-check function in 'agent' mode (caller's JWT + agency verified
// server-side). No consumer consent is recorded, so it's never auto-texted.
export const useAgentUploadDecPage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, file, firstName, phone, zip, housing }) => {
      const prepared = await prepareDecPage(file);
      const { data, error } = await supabase.functions.invoke('rate-check', {
        body: {
          mode: 'agent',
          agency_id: agencyId,
          image_base64: prepared.base64,
          media_type: prepared.mediaType,
          first_name: firstName.trim(),
          phone: phone.replace(/\D/g, ''),
          zip: zip || '',
          housing_situation: housing || null,
        },
      });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* keep default */ }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
    },
  });
};

// ── Routing rules (Rules tab) ────────────────────────────────────────────────

export const useRateCheckRules = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.rules(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_rules')
        .select('*')
        .eq('agency_id', agencyId)
        .order('priority')
        .order('created_at');
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

// Insert (no id) or update one rule, then re-run the rules on open rate checks.
export const useSaveRateCheckRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId, values }) => {
      const row = { ...values, agency_id: agencyId, updated_at: new Date().toISOString() };
      const q = id
        ? supabase.from('rate_check_rules').update(row).eq('id', id)
        : supabase.from('rate_check_rules').insert(row);
      const { data, error } = await q.select().single();
      if (error) throw error;
      await supabase.rpc('rate_check_redecide', { p_agency_id: agencyId });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

export const useDeleteRateCheckRule = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId }) => {
      const { error } = await supabase.from('rate_check_rules').delete().eq('id', id);
      if (error) throw error;
      await supabase.rpc('rate_check_redecide', { p_agency_id: agencyId });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// Add the default rule set (only if the agency has none).
export const useSeedRateCheckRules = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (agencyId) => {
      const { data, error } = await supabase.rpc('rate_check_rules_seed', { p_agency_id: agencyId });
      if (error) throw error;
      await supabase.rpc('rate_check_redecide', { p_agency_id: agencyId });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// ── Tagged invite links (events) ─────────────────────────────────────────────

export const useRateCheckInvites = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.invites(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_invites')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

export const useRateCheckEvents = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.events(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_events')
        .select('event_name, last_used_at, invites')
        .eq('agency_id', agencyId)
        .order('last_used_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

// The code is generated by the database. Returns the full row (code included).
export const useCreateRateCheckInvite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, userId, producerName, eventName, firstName, phone }) => {
      const { data, error } = await supabase
        .from('rate_check_invites')
        .insert({
          agency_id: agencyId,
          created_by: userId,
          producer_name: producerName || null,
          event_name: eventName?.trim() || null,
          first_name: firstName?.trim() || null,
          phone: phone ? phone.replace(/\D/g, '').slice(-10) || null : null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// "Scan again": re-read the stored photo (after a failure, or a bad read).
export const useRescanRateCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rateCheckId }) => {
      const { data, error } = await supabase.functions.invoke('rate-check', { body: { mode: 'rescan', rate_check_id: rateCheckId } });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* keep default */ }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() }),
  });
};

// The policy was written. Closes the loop: status 'bound', lead closed_won.
export const useBindRateCheck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rateCheckId, carrier, premium }) => {
      const { data, error } = await supabase.functions.invoke('rate-check-outcome', {
        body: { action: 'bound', rate_check_id: rateCheckId, bound_carrier: carrier, bound_premium: premium ?? null },
      });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* keep default */ }
        throw new Error(message);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.leads.all() });
    },
  });
};

// Scoreboard: links → opened → uploaded → quoted → won → bound, per event and producer.
export const useRateCheckInviteStats = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.inviteStats(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase.from('rate_check_invite_stats').select('*').eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

// ── Partners (people outside the agency paid per qualified household) ─────────

export const usePromoters = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.promoters(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_promoters')
        .select('*')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

// Every scan that came through a partner link — the payout math runs on these.
export const usePromoterScans = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.promoterScans(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_checks')
        .select('id, promoter_id, phone, first_name, policy_type, carrier, status, duplicate_of, created_at, annual_premium, allstate_premium, bound_premium')
        .eq('agency_id', agencyId)
        .not('promoter_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

export const usePromoterRates = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.promoterRates(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase.from('rate_check_promoter_rates').select('tier, amount').eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

export const usePromoterPayouts = (agencyId) =>
  useQuery({
    queryKey: queryKeys.rateChecks.promoterPayouts(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_check_promoter_payouts')
        .select('*')
        .eq('agency_id', agencyId)
        .order('period', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
  });

export const useSavePromoter = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, agencyId, userId, ...fields }) => {
      const clean = {
        ...('name' in fields ? { name: fields.name.trim() } : {}),
        ...('phone' in fields ? { phone: (fields.phone || '').replace(/\D/g, '').slice(-10) || null } : {}),
        ...('email' in fields ? { email: fields.email?.trim() || null } : {}),
        ...('active' in fields ? { active: !!fields.active } : {}),
        ...('w9_received_at' in fields ? { w9_received_at: fields.w9_received_at } : {}),
        ...('notes' in fields ? { notes: fields.notes?.trim() || null } : {}),
        ...('monthly_cap' in fields ? { monthly_cap: fields.monthly_cap ? Math.max(1, Math.min(1000, Math.round(Number(fields.monthly_cap)))) : null } : {}),
      };
      const q = id
        ? supabase.from('rate_check_promoters').update(clean).eq('id', id)
        : supabase.from('rate_check_promoters').insert({ ...clean, agency_id: agencyId, created_by: userId });
      const { data, error } = await q.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.promoters(v.agencyId) }),
  });
};

export const useSavePromoterRates = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, schedule }) => {
      const rows = Object.entries(schedule).map(([tier, amount]) => ({ agency_id: agencyId, tier, amount: Number(amount) || 0, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('rate_check_promoter_rates').upsert(rows, { onConflict: 'agency_id,tier' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.promoterRates(v.agencyId) }),
  });
};

// One row per partner per month; recording it again for the same month replaces it.
export const useRecordPromoterPayout = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, promoterId, period, households, amount, userId, remove = false }) => {
      if (remove) {
        const { error } = await supabase.from('rate_check_promoter_payouts').delete().eq('promoter_id', promoterId).eq('period', period);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('rate_check_promoter_payouts').upsert(
        { agency_id: agencyId, promoter_id: promoterId, period, households, amount, paid_by: userId, paid_at: new Date().toISOString() },
        { onConflict: 'promoter_id,period' },
      );
      if (error) throw error;
    },
    onSuccess: (_d, v) => queryClient.invalidateQueries({ queryKey: queryKeys.rateChecks.promoterPayouts(v.agencyId) }),
  });
};
