// src/hooks/useRenewalCases.js
// React Query hooks for the Renewal Management module.
// Handles fetching, filtering, and mutating renewal case records.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// ── Fetch function ──────────────────────────────────────────────────────────

async function fetchRenewalPolicies(agencyId, filters = {}) {
  let query = supabase
    .from('renewal_cases')
    .select('*')
    .eq('agency_id', agencyId);

  // Apply filters
  if (filters.status) {
    query = query.eq('renewal_status', filters.status);
  }
  if (filters.priorityTier) {
    query = query.eq('priority_tier', filters.priorityTier);
  }
  if (filters.assignedTo) {
    query = query.eq('assigned_to_id', filters.assignedTo);
  }
  if (filters.policyType) {
    query = query.eq('policy_type', filters.policyType);
  }
  if (filters.dateRange?.start) {
    query = query.gte('renewal_date', filters.dateRange.start);
  }
  if (filters.dateRange?.end) {
    query = query.lte('renewal_date', filters.dateRange.end);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`customer_name.ilike.${term},policy_no.ilike.${term}`);
  }

  // Default: exclude resolved/closed cases unless caller explicitly includes them
  if (!filters.includeResolved) {
    query = query.not('status', 'in', '(auto_resolved,confirmed,lost,unreachable)');
  }

  // Default: exclude past renewal dates unless caller explicitly includes them
  // Past-due renewals have no action to take — they either renewed or are now
  // in the pending cancel queue
  if (!filters.includePast) {
    const today = new Date().toISOString().slice(0, 10);
    query = query.gte('renewal_date', today);
  }

  // Default sort: renewal_date ASC (soonest first)
  query = query
    .order('renewal_date', { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// Fetch consent records for the agency to join client-side
async function fetchConsentMap(agencyId) {
  const { data, error } = await supabase
    .from('customer_consent')
    .select('customer_phone, autodial_consent, autodial_consent_date, dnc')
    .eq('agency_id', agencyId);

  if (error) throw error;

  const map = {};
  if (Array.isArray(data)) {
    data.forEach((c) => {
      if (c.customer_phone) {
        map[c.customer_phone] = {
          autodial_consent: c.autodial_consent,
          autodial_consent_date: c.autodial_consent_date,
          dnc: c.dnc,
        };
      }
    });
  }
  return map;
}

// ── Priority sort helper ────────────────────────────────────────────────────

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, standard: 3, opportunity: 4 };

function sortByPriorityThenDate(policies) {
  return [...policies].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority_tier] ?? 4;
    const pb = PRIORITY_ORDER[b.priority_tier] ?? 4;
    if (pa !== pb) return pa - pb;
    return (a.renewal_date || '').localeCompare(b.renewal_date || '');
  });
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useRenewalPolicies(agencyId, filters = {}) {
  const policiesQuery = useQuery({
    queryKey: queryKeys.renewals.list(agencyId, filters),
    queryFn: () => fetchRenewalPolicies(agencyId, filters),
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  const consentQuery = useQuery({
    queryKey: queryKeys.renewals.consentMap(agencyId),
    queryFn: () => fetchConsentMap(agencyId),
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
  });

  // Merge consent into policies
  const data = (() => {
    if (!Array.isArray(policiesQuery.data)) return [];
    const consentMap = consentQuery.data || {};
    const merged = policiesQuery.data.map((p) => ({
      ...p,
      consent: p.phone ? consentMap[p.phone] || null : null,
    }));
    return sortByPriorityThenDate(merged);
  })();

  return {
    data,
    isLoading: policiesQuery.isLoading || consentQuery.isLoading,
    error: policiesQuery.error || consentQuery.error,
    refetch: () => {
      policiesQuery.refetch();
      consentQuery.refetch();
    },
  };
}

// ── Single renewal detail ───────────────────────────────────────────────────

export function useRenewalDetail(policyId) {
  return useQuery({
    queryKey: queryKeys.renewals.detail(policyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_cases')
        .select('*')
        .eq('id', policyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!policyId,
    staleTime: 60 * 1000,
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useLogContact() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ policyId, channel, outcome, notes, escalate, followupReason, assignedTo }) => {
      // First get current attempt_count
      const { data: current, error: fetchErr } = await supabase
        .from('renewal_cases')
        .select('attempt_count, agency_id')
        .eq('id', policyId)
        .single();
      if (fetchErr) throw fetchErr;

      const updates = {
        attempt_count: (current.attempt_count || 0) + 1,
        last_contact_date: new Date().toISOString(),
        last_contact_outcome: outcome,
        last_contact_channel: channel,
        followup_notes: notes || null,
      };

      if (escalate) {
        updates.human_followup_required = true;
        updates.followup_reason = followupReason || 'manual';
        updates.renewal_status = 'escalated';
      }
      if (assignedTo) {
        updates.assigned_to_id = assignedTo;
      }
      if (outcome === 'confirmed') {
        updates.renewal_status = 'confirmed';
      }
      if (outcome === 'wrong_number') {
        updates.human_followup_required = true;
        updates.followup_reason = 'wrong_number';
      }

      const { data, error } = await supabase
        .from('renewal_cases')
        .update(updates)
        .eq('id', policyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.detail(data.id) });
    },
  });
}

export function useUpdateRenewalStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ policyId, status, followupCompleted }) => {
      const updates = { renewal_status: status };
      if (followupCompleted) {
        updates.followup_completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('renewal_cases')
        .update(updates)
        .eq('id', policyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.detail(data.id) });
    },
  });
}

export function useAssignFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ policyId, assignedTo, followupReason, notes }) => {
      const updates = {
        assigned_to_id: assignedTo,
        human_followup_required: true,
      };
      if (followupReason) updates.followup_reason = followupReason;
      if (notes) updates.followup_notes = notes;

      const { data, error } = await supabase
        .from('renewal_cases')
        .update(updates)
        .eq('id', policyId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.renewals.detail(data.id) });
    },
  });
}
