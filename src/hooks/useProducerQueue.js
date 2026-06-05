// src/hooks/useProducerQueue.js
// The producer's daily new-business queue — assigned leads, ranked "work these
// next", with the same attempt / follow-up / snooze accountability the
// retention team already has. Assignment reuses leads.assigned_to_user_id.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useCurrentEmployee } from './useCurrentEmployee';

const OPEN_EXCLUDED = ['closed_won', 'closed_lost', 'inactive'];

// Rank: leads with a follow-up due (or overdue) float to the top, then by lead
// score, then oldest first — so nothing assigned just sits and goes cold.
function rankLead(l, now) {
  const due = l.next_followup_at ? new Date(l.next_followup_at).getTime() : null;
  if (due != null && due <= now) return 0;            // follow-up due/overdue
  if (due != null) return 1;                          // follow-up scheduled (future)
  return 2;                                           // no follow-up set
}

function sortQueue(leads) {
  const now = Date.now();
  return [...leads].sort((a, b) => {
    const ra = rankLead(a, now), rb = rankLead(b, now);
    if (ra !== rb) return ra - rb;
    const sa = a.lead_score ?? 0, sb = b.lead_score ?? 0;
    if (sa !== sb) return sb - sa;                     // higher score first
    return (a.created_at || '').localeCompare(b.created_at || '');
  });
}

export function useProducerQueue() {
  const { data: employee } = useCurrentEmployee();
  const authUserId = employee?.auth_user_id;
  const agencyId = employee?.org_id;

  const query = useQuery({
    queryKey: ['producer_queue', authUserId],
    enabled: !!authUserId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('leads')
        .select(`
          id, status, product_intent, state, zip, lead_score, score_factors,
          risk_flag, current_auto_carrier, current_home_carrier,
          attempt_count, last_attempt_at, last_attempt_result,
          next_followup_at, callback_note, created_at,
          lead_quotes ( quote_summary, enrichment_status )
        `)
        .eq('assigned_to_user_id', authUserId)
        .not('status', 'in', `(${OPEN_EXCLUDED.join(',')})`)
        .or(`snoozed_until.is.null,snoozed_until.lte.${nowIso}`)
        .limit(500);
      if (error) throw error;
      return sortQueue(data || []);
    },
  });

  const leads = query.data || [];
  const now = Date.now();
  const followupsDue = leads.filter(
    (l) => l.next_followup_at && new Date(l.next_followup_at).getTime() <= now
  ).length;
  const dailyTarget = employee?.daily_call_target ?? 8;
  const touchedToday = leads.filter(
    (l) => l.last_attempt_at && l.last_attempt_at.slice(0, 10) === new Date().toISOString().slice(0, 10)
  ).length;

  return {
    ...query,
    leads,
    employeeId: employee?.id,
    agencyId,
    dailyTarget,
    touchedToday,
    followupsDue,
  };
}

export function useLogLeadTouch() {
  const queryClient = useQueryClient();
  const { data: employee } = useCurrentEmployee();
  return useMutation({
    mutationFn: async ({ lead, result, note }) => {
      await supabase.from('lead_attempts').insert({
        lead_id: lead.id,
        agency_id: employee?.org_id,
        employee_id: employee?.id ?? null,
        method: 'phone',
        result,
        note: note || null,
      });
      const updates = {
        attempt_count: (lead.attempt_count || 0) + 1,
        last_attempt_at: new Date().toISOString(),
        last_attempt_result: result,
      };
      // First meaningful touch advances a new/assigned lead to "contacted".
      if (['new', 'assigned'].includes(lead.status)) updates.status = 'contacted';
      const { error } = await supabase.from('leads').update(updates).eq('id', lead.id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['producer_queue', employee?.auth_user_id] }),
  });
}

export function useScheduleLeadFollowup() {
  const queryClient = useQueryClient();
  const { data: employee } = useCurrentEmployee();
  return useMutation({
    mutationFn: async ({ leadId, followupAt, note }) => {
      const { error } = await supabase
        .from('leads')
        .update({ next_followup_at: followupAt, callback_note: note || null })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['producer_queue', employee?.auth_user_id] }),
  });
}

export function useSnoozeLead() {
  const queryClient = useQueryClient();
  const { data: employee } = useCurrentEmployee();
  return useMutation({
    mutationFn: async ({ leadId, days, reason }) => {
      const until = new Date();
      until.setDate(until.getDate() + days);
      const { error } = await supabase
        .from('leads')
        .update({ snoozed_until: until.toISOString(), snooze_reason: reason || null })
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['producer_queue', employee?.auth_user_id] }),
  });
}
