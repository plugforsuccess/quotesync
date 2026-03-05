// src/hooks/useEmployees.js
// React Query hooks for the Employee Management module.
// Handles CRUD for the employees table, verification tracking,
// and overdue verification queries.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Query key factories ─────────────────────────────────────────────────────

export const employeeKeys = {
  all: (orgId) => ['employees', 'roster', orgId],
  single: (id) => ['employees', 'detail', id],
  verificationsDue: (orgId) => ['employees', 'verification-due', orgId],
  verificationHistory: (employeeId) => ['employee-verifications', employeeId],
  agentAliases: (orgId) => ['employees', 'agent-aliases', orgId],
  unmatchedAgents: (orgId) => ['employees', 'unmatched-agents', orgId],
};

// ── Fetch functions ─────────────────────────────────────────────────────────

async function fetchEmployees(orgId) {
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('org_id', orgId)
    .order('employment_status', { ascending: true })
    .order('last_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchVerificationsDue(orgId) {
  // Fetch active employees whose last_verified_at is NULL or > 90 days ago
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const { data, error } = await supabase
    .from('employees')
    .select('id, first_name, last_name, last_verified_at')
    .eq('org_id', orgId)
    .eq('employment_status', 'active')
    .or(`last_verified_at.is.null,last_verified_at.lt.${ninetyDaysAgo.toISOString()}`);

  if (error) throw error;
  return data || [];
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useEmployeeRoster(orgId) {
  return useQuery({
    queryKey: employeeKeys.all(orgId),
    queryFn: () => fetchEmployees(orgId),
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

export function useVerificationDue(orgId) {
  return useQuery({
    queryKey: employeeKeys.verificationsDue(orgId),
    queryFn: () => fetchVerificationsDue(orgId),
    enabled: !!orgId,
    staleTime: 60 * 60 * 1000, // 1 hour — doesn't need to be real-time
  });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useAddEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (employee) => {
      const { data, error } = await supabase
        .from('employees')
        .insert({
          ...employee,
          last_verified_at: new Date().toISOString(), // creating counts as first verification
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all(data.org_id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.verificationsDue(data.org_id) });
    },
  });
}

export function useUpdateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }) => {
      const { data, error } = await supabase
        .from('employees')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all(data.org_id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.verificationsDue(data.org_id) });
    },
  });
}

export function useTerminateEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, termination_date, termination_reason }) => {
      const { data, error } = await supabase
        .from('employees')
        .update({
          employment_status: 'terminated',
          termination_date,
          termination_reason,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.all(data.org_id) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.verificationsDue(data.org_id) });
    },
  });
}

export function useVerifyEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ employeeId, verifiedBy, notes }) => {
      // Update the employee record
      const { error: updateError } = await supabase
        .from('employees')
        .update({
          last_verified_at: new Date().toISOString(),
          verified_by: verifiedBy,
          verification_alert_sent_at: null, // reset alert flag
        })
        .eq('id', employeeId);

      if (updateError) throw updateError;

      // Insert audit trail record
      const { error: insertError } = await supabase
        .from('employee_verifications')
        .insert({
          employee_id: employeeId,
          verified_by: verifiedBy,
          notes,
        });

      if (insertError) throw insertError;

      // Re-fetch the employee to get org_id for invalidation
      const { data: employee } = await supabase
        .from('employees')
        .select('org_id')
        .eq('id', employeeId)
        .single();

      return employee;
    },
    onSuccess: (data) => {
      if (data?.org_id) {
        queryClient.invalidateQueries({ queryKey: employeeKeys.all(data.org_id) });
        queryClient.invalidateQueries({ queryKey: employeeKeys.verificationsDue(data.org_id) });
      }
    },
  });
}

// ── Active employees for dropdowns (Attendance, Performance) ────────────────

export function useActiveEmployees(orgId) {
  return useQuery({
    queryKey: ['employees', 'active', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, role_type, rc_display_name, auth_user_id, default_start_time, default_lunch_out, default_lunch_in, default_end_time')
        .eq('org_id', orgId)
        .eq('employment_status', 'active')
        .order('last_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Active service reps for Performance team view ────────────────────────────

export function useActiveServiceReps(orgId) {
  return useQuery({
    queryKey: ['employees', 'service-reps', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, role_type, auth_user_id')
        .eq('org_id', orgId)
        .eq('employment_status', 'active')
        .eq('role_type', 'service');

      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── RC display name map for XLSX upload matching ────────────────────────────
// Matching priority: 1) alias table  2) rc_display_name  3) preferred+last  4) first+last

export function useRCEmployeeMap(orgId) {
  return useQuery({
    queryKey: ['employees', 'rc-map', orgId],
    queryFn: async () => {
      // Fetch employees and aliases in parallel
      const [empResult, aliasResult] = await Promise.all([
        supabase
          .from('employees')
          .select('id, first_name, last_name, preferred_name, rc_display_name, auth_user_id')
          .eq('org_id', orgId)
          .eq('employment_status', 'active'),
        supabase
          .from('rc_agent_aliases')
          .select('alias_key, employee_user_id')
          .eq('org_id', orgId)
          .eq('active', true),
      ]);

      if (empResult.error) throw empResult.error;

      const map = {};

      // Layer 4 (lowest priority): first_name + last_name
      (empResult.data || []).forEach((emp) => {
        const value = emp.auth_user_id;
        if (!value) return; // skip employees without auth linkage
        const fullName = `${emp.first_name} ${emp.last_name}`.trim().toLowerCase();
        if (fullName && !map[fullName]) {
          map[fullName] = value;
        }
      });

      // Layer 3: preferred_name + last_name
      (empResult.data || []).forEach((emp) => {
        const value = emp.auth_user_id;
        if (!value || !emp.preferred_name) return;
        const prefName = `${emp.preferred_name} ${emp.last_name}`.trim().toLowerCase();
        if (prefName && !map[prefName]) {
          map[prefName] = value;
        }
      });

      // Layer 2: rc_display_name (overrides computed names)
      (empResult.data || []).forEach((emp) => {
        const value = emp.auth_user_id;
        if (!value || !emp.rc_display_name) return;
        map[emp.rc_display_name.trim().toLowerCase()] = value;
      });

      // Layer 1 (highest priority): alias table (admin decisions override everything)
      if (!aliasResult.error) {
        (aliasResult.data || []).forEach((alias) => {
          map[alias.alias_key] = alias.employee_user_id;
        });
      }

      return map;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Agent Aliases CRUD ──────────────────────────────────────────────────────

export function useAgentAliases(orgId) {
  return useQuery({
    queryKey: employeeKeys.agentAliases(orgId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rc_agent_aliases')
        .select('id, alias_key, alias_display, employee_user_id, created_at, created_by, source, active')
        .eq('org_id', orgId)
        .eq('active', true)
        .order('alias_display');

      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUnmatchedAgents(orgId) {
  return useQuery({
    queryKey: employeeKeys.unmatchedAgents(orgId),
    queryFn: async () => {
      // Find distinct unmatched agent names (employee_user_id IS NULL)
      const { data, error } = await supabase
        .from('rc_call_log')
        .select('employee_name')
        .eq('org_id', orgId)
        .is('employee_user_id', null)
        .limit(1000);

      if (error) throw error;

      // Group by name and count occurrences
      const counts = {};
      (data || []).forEach((row) => {
        const name = row.employee_name;
        if (!name || name === 'Unknown') return;
        counts[name] = (counts[name] || 0) + 1;
      });

      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

/** Normalize an alias key: lowercase, collapse whitespace, strip non-alphanumeric (except spaces). */
function normalizeAliasKey(name) {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSaveAgentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, aliasDisplay, employeeUserId }) => {
      const aliasKey = normalizeAliasKey(aliasDisplay);
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('rc_agent_aliases')
        .upsert({
          org_id: orgId,
          alias_key: aliasKey,
          alias_display: aliasDisplay,
          employee_user_id: employeeUserId,
          created_by: user?.id,
          source: 'manual',
          active: true,
        }, {
          onConflict: 'org_id,alias_key',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.agentAliases(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: employeeKeys.unmatchedAgents(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: ['employees', 'rc-map', variables.orgId] });
    },
  });
}

export function useDeleteAgentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, orgId }) => {
      // Soft-delete: set active = false
      const { error } = await supabase
        .from('rc_agent_aliases')
        .update({ active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.agentAliases(variables.orgId) });
      queryClient.invalidateQueries({ queryKey: ['employees', 'rc-map', variables.orgId] });
    },
  });
}

export function useBackfillAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, aliasDisplay, employeeUserId }) => {
      // Update past unmatched call log rows that match this alias
      const { data, error } = await supabase
        .from('rc_call_log')
        .update({ employee_user_id: employeeUserId })
        .eq('org_id', orgId)
        .is('employee_user_id', null)
        .eq('employee_name', aliasDisplay)
        .select('id');

      if (error) throw error;
      return { updated: data?.length || 0 };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.unmatchedAgents(variables.orgId) });
    },
  });
}
