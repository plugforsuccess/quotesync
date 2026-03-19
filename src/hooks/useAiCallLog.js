// src/hooks/useAiCallLog.js
// React Query hook for AI call metrics from the ai_call_log table.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

async function fetchAiCallLog(agencyId, daysBack = 30, callType = null) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  let query = supabase
    .from('ai_call_log')
    .select('*')
    .eq('agency_id', agencyId)
    .gte('called_at', since.toISOString())
    .order('called_at', { ascending: false });

  if (callType) query = query.eq('call_type', callType);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

function computeMetrics(logs) {
  if (!logs || logs.length === 0) {
    return {
      totalCalls: 0,
      completedCalls: 0,
      totalMinutes: 0,
      totalCost: 0,
      outcomeDistribution: {},
      consentCaptureRate: 0,
      confirmedRate: 0,
      warmEscalationRate: 0,
      costPerConfirmed: 0,
      dailyVolume: {},
    };
  }

  const completed = logs.filter(l => l.call_outcome && l.call_outcome !== 'queued');
  const totalMinutes = completed.reduce((sum, l) => sum + (l.call_length_seconds || 0), 0) / 60;
  const totalCost = completed.reduce((sum, l) => sum + parseFloat(l.estimated_cost_usd || 0), 0);

  // Outcome distribution
  const outcomeDistribution = {};
  completed.forEach(l => {
    const o = l.call_outcome || 'unknown';
    outcomeDistribution[o] = (outcomeDistribution[o] || 0) + 1;
  });

  // Consent capture rate
  const consentAttempts = completed.filter(l => l.consent_captured);
  const consentCaptureRate = completed.length > 0
    ? (consentAttempts.length / completed.length) * 100
    : 0;

  // Confirmed rate (confirmed without human follow-up)
  const confirmed = completed.filter(l => l.call_outcome === 'confirmed');
  const confirmedRate = completed.length > 0
    ? (confirmed.length / completed.length) * 100
    : 0;

  // Warm escalation rate (callback_confirmed among escalations)
  const escalations = completed.filter(l =>
    ['rate_shock_escalated', 'callback_scheduled', 'shopping', 'out_of_scope_escalated'].includes(l.call_outcome)
  );
  const warmEscalations = escalations.filter(l => l.callback_confirmed);
  const warmEscalationRate = escalations.length > 0
    ? (warmEscalations.length / escalations.length) * 100
    : 0;

  // Cost per confirmed
  const costPerConfirmed = confirmed.length > 0 ? totalCost / confirmed.length : 0;

  // Daily volume
  const dailyVolume = {};
  completed.forEach(l => {
    const day = l.called_at?.split('T')[0];
    if (day) {
      if (!dailyVolume[day]) dailyVolume[day] = { total: 0, confirmed: 0, escalated: 0, no_answer: 0 };
      dailyVolume[day].total++;
      if (l.call_outcome === 'confirmed') dailyVolume[day].confirmed++;
      if (['rate_shock_escalated', 'callback_scheduled', 'out_of_scope_escalated', 'shopping'].includes(l.call_outcome)) dailyVolume[day].escalated++;
      if (['no_answer', 'voicemail'].includes(l.call_outcome)) dailyVolume[day].no_answer++;
    }
  });

  return {
    totalCalls: logs.length,
    completedCalls: completed.length,
    totalMinutes: Math.round(totalMinutes * 10) / 10,
    totalCost: Math.round(totalCost * 100) / 100,
    outcomeDistribution,
    consentCaptureRate: Math.round(consentCaptureRate * 10) / 10,
    confirmedRate: Math.round(confirmedRate * 10) / 10,
    warmEscalationRate: Math.round(warmEscalationRate * 10) / 10,
    costPerConfirmed: Math.round(costPerConfirmed * 100) / 100,
    dailyVolume,
  };
}

export function useAiCallLog(agencyId, daysBack = 30, callType = null) {
  const query = useQuery({
    queryKey: queryKeys.renewals.aiCallLog(agencyId, daysBack, callType),
    queryFn: () => fetchAiCallLog(agencyId, daysBack, callType),
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const metrics = computeMetrics(query.data);

  return {
    logs: query.data || [],
    metrics,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

// Webhook health: policies with ai_voice channel but no matching ai_call_log
export function useWebhookHealth(agencyId) {
  return useQuery({
    queryKey: queryKeys.renewals.webhookHealth(agencyId),
    queryFn: async () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Fetch ai_voice policies with no outcome and recent contact
      const { data: policies, error: pError } = await supabase
        .from('renewal_cases')
        .select('id, policy_no, customer_name, last_contact_date')
        .eq('agency_id', agencyId)
        .eq('last_contact_channel', 'ai_voice')
        .is('last_contact_outcome', null)
        .lt('last_contact_date', oneHourAgo);

      if (pError) throw pError;
      if (!policies || policies.length === 0) return { orphaned: [] };

      // Check which have no ai_call_log entry
      const policyIds = policies.map(p => p.id);
      const { data: loggedPolicies, error: lError } = await supabase
        .from('ai_call_log')
        .select('policy_id')
        .in('policy_id', policyIds);

      if (lError) throw lError;

      const loggedSet = new Set((loggedPolicies || []).map(l => l.policy_id));
      const orphaned = policies.filter(p => !loggedSet.has(p.id));

      return { orphaned };
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
