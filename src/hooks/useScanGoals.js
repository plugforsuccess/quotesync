// src/hooks/useScanGoals.js
// Scans & Quotes goals (scan_goals RPC), the goal settings, and shared report links.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { summarize } from '../lib/scanGoals';

/** Agency scans + people quoted, summarized (see lib/scanGoals). Refreshes every 2 minutes. */
export function useScanGoals(agencyId) {
  return useQuery({
    queryKey: ['scan_goals', agencyId],
    enabled: !!agencyId,
    refetchInterval: 120000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scan_goals', { p_agency: agencyId, p_days: 35 });
      if (error) throw error;
      return summarize(data);
    },
  });
}

/** Save the agency's daily goals (principal/manager). */
export function useSaveScanGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, scans, people }) => {
      const { error } = await supabase.from('producer_floor_settings')
        .upsert({ agency_id: agencyId, scans_goal_daily: scans, quotes_floor: people }, { onConflict: 'agency_id' });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['scan_goals', v.agencyId] });
      qc.invalidateQueries({ queryKey: ['producer_floor_settings', v.agencyId] });
    },
  });
}

const linksKey = (agencyId) => ['scan_report_links', agencyId];

export function useScanReportLinks(agencyId, enabled = true) {
  return useQuery({
    queryKey: linksKey(agencyId),
    enabled: !!agencyId && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('scan_report_links')
        .select('id, token, label, created_at').eq('agency_id', agencyId).is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateScanReportLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, label }) => {
      const { data, error } = await supabase.from('scan_report_links')
        .insert({ agency_id: agencyId, label: (label || '').trim() || null }).select('id, token, label, created_at').single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: linksKey(v.agencyId) }),
  });
}

/** Turn a shared link off. The page stops working for whoever has it. */
export function useRevokeScanReportLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }) => {
      const { error } = await supabase.from('scan_report_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: linksKey(v.agencyId) }),
  });
}

/** The public report behind a shared link (no sign-in). null = link not found or turned off. */
export function useScanReport(token) {
  return useQuery({
    queryKey: ['scan_report', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('scan_report', { p_token: token });
      if (error) throw error;
      return data || null;
    },
  });
}
