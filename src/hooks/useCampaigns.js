// src/hooks/useCampaigns.js
// Campaigns (principal): email and text drips and blasts. Sending is the campaigns-run
// edge function; this reads and edits the campaigns and shows how they're going.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const KEY = 'campaigns';

export function useCampaigns() {
  const { currentAgencyId } = useAuth();
  return useQuery({
    queryKey: [KEY, currentAgencyId],
    enabled: !!currentAgencyId,
    queryFn: async () => {
      const { data, error } = await supabase.from('campaigns').select('*')
        .eq('agency_id', currentAgencyId).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

/** How a campaign is going: people in it, where they stopped, and sends per step. */
export function useCampaignStats(campaignId) {
  return useQuery({
    queryKey: [KEY, 'stats', campaignId],
    enabled: !!campaignId,
    refetchInterval: 60000,
    queryFn: async () => {
      const [{ data: people, error: e1 }, { data: sends, error: e2 }] = await Promise.all([
        supabase.from('campaign_enrollments').select('steps_done, stopped_reason').eq('campaign_id', campaignId).limit(20000),
        supabase.from('campaign_sends').select('step, channel, status, note').eq('campaign_id', campaignId).limit(50000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const stopped = {};
      for (const p of people || []) if (p.stopped_reason) stopped[p.stopped_reason] = (stopped[p.stopped_reason] || 0) + 1;
      const steps = {};
      for (const s of sends || []) {
        const r = (steps[s.step] ||= { sent: 0, skipped: 0, failed: 0 });
        r[s.status] = (r[s.status] || 0) + 1;
      }
      const joined = (people || []).filter(p => p.stopped_reason !== 'already_in_audience').length;
      const uploaded = stopped.uploaded || 0;
      return { joined, active: (people || []).filter(p => !p.stopped_reason).length, stopped, steps, uploaded };
    },
  });
}

/** Who an audience reaches right now: { people, email, text, sample }. */
export function useAudienceCount(audience) {
  const { currentAgencyId } = useAuth();
  const key = JSON.stringify(audience || {});
  return useQuery({
    queryKey: [KEY, 'audience', currentAgencyId, key],
    enabled: !!currentAgencyId && !!audience?.type,
    staleTime: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('campaign_audience_count', { p_agency: currentAgencyId, p_audience: audience });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveCampaign() {
  const { currentAgencyId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }) => {
      if (id) {
        const { data, error } = await supabase.from('campaigns').update(fields).eq('id', id).select().single();
        if (error) throw error;
        return data;
      }
      const { data, error } = await supabase.from('campaigns').insert({ agency_id: currentAgencyId, ...fields }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Sends one step to the principal ("Send Tests To" email, or a phone for a text). */
export async function sendCampaignTest({ campaignId, step, phone }) {
  const { data, error } = await supabase.functions.invoke('campaigns-run', { body: { mode: 'test', campaign_id: campaignId, step, phone } });
  if (error) {
    let msg = null;
    try { msg = (await error.context?.json())?.error; } catch { /* not JSON */ }
    throw new Error(msg || 'Could not send the test.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
