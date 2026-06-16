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
        .select('id, first_name, last_name, preferred_name, roles, rc_display_name, auth_user_id, default_start_time, default_lunch_out, default_lunch_in, default_end_time, hire_date, pto_days_per_year, sick_days_per_year, pto_eligible_date')
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

// Everyone a task/case can be assigned to — active agency members, including
// sales producers and unlicensed staff who have a membership but no employee
// row. Keyed by employee id when one exists (so attribution/display still work),
// else the user id. Backed by the agency_assignable_members SECURITY DEFINER fn.
export function useAssignableMembers(orgId) {
  return useQuery({
    queryKey: ['assignable_members', orgId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('agency_assignable_members', { p_agency_id: orgId });
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
        .select('id, first_name, last_name, preferred_name, roles, auth_user_id')
        .eq('org_id', orgId)
        .eq('employment_status', 'active')
        .overlaps('roles', ['service_inbound', 'service_outbound', 'service']);

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

      // All computed keys go through normalizeAliasKey so that
      // ingestion lookup (also via normalizeAliasKey) always matches.
      //
      // Identity value: auth_user_id for linked employees, employees.id
      // for unlinked employees (no app login). Both are valid UUIDs stored
      // in rc_call_log.employee_user_id (no FK constraint).

      // Layer 4 (lowest priority): first_name + last_name
      (empResult.data || []).forEach((emp) => {
        const value = emp.auth_user_id || emp.id;
        const key = normalizeAliasKey(`${emp.first_name} ${emp.last_name}`);
        if (key && !map[key]) {
          map[key] = value;
        }
      });

      // Layer 3: preferred_name + last_name
      (empResult.data || []).forEach((emp) => {
        if (!emp.preferred_name) return;
        const value = emp.auth_user_id || emp.id;
        const key = normalizeAliasKey(`${emp.preferred_name} ${emp.last_name}`);
        if (key && !map[key]) {
          map[key] = value;
        }
      });

      // Layer 2: rc_display_name (overrides computed names)
      (empResult.data || []).forEach((emp) => {
        if (!emp.rc_display_name) return;
        const value = emp.auth_user_id || emp.id;
        const key = normalizeAliasKey(emp.rc_display_name);
        if (key) {
          map[key] = value;
        }
      });

      // Layer 1 (highest priority): alias table keys are already normalized at creation time
      if (!aliasResult.error) {
        (aliasResult.data || []).forEach((alias) => {
          if (alias.alias_key) {
            map[alias.alias_key] = alias.employee_user_id;
          }
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
      // Server-side aggregation via RPC (GROUP BY in Postgres, not client-side)
      const { data, error } = await supabase
        .rpc('get_unmatched_agent_names', { p_org_id: orgId });

      if (error) throw error;
      return (data || []).map((row) => ({
        name: row.name,           // representative display name for UI
        nameKey: row.name_key,    // normalized key for backfill matching
        count: Number(row.call_count),
      }));
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Normalize an alias key for deterministic many-to-one matching.
 *
 * Rules (in order):
 *  1. NFKC unicode normalization (collapses ligatures, fullwidth, etc.)
 *  2. NBSP / weird whitespace → regular space, then collapse
 *  3. Lowercase (no locale — uses base toLowerCase for determinism)
 *  4. Strip trailing phone fragments the parser may have missed
 *  5. Remove non-letter, non-digit, non-space, non-hyphen chars
 *  6. Final whitespace collapse + trim
 *
 * IMPORTANT: This function must stay in sync with `normalizeForLookup` below.
 * Both are used across alias creation, ingestion lookup, and backfill matching.
 */
export function normalizeAliasKey(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKC');
  s = s.replace(/\u00A0/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.toLowerCase();
  // Strip phone fragments: "(203) 555-1234", "+12035551234", trailing 10-digit
  s = s.replace(/\(\d{3}\)\s*\d{3}[-\s]*\d{4}/g, '');
  s = s.replace(/\+?1?\s*\d{10}\b/g, '');
  // Keep letters (any script), digits, spaces, hyphens
  s = s.replace(/[^\p{L}\p{N}\s-]/gu, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Lighter normalization for map lookups during ingestion.
 * Must produce the same key as normalizeAliasKey for any given display name,
 * so that alias table entries are found during upload matching.
 *
 * Exported so CallLogUploadForm can use the same path instead of bare `.toLowerCase()`.
 */
export function normalizeForLookup(name) {
  return normalizeAliasKey(name);
}

export function useSaveAgentAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, aliasDisplay, employeeUserId }) => {
      const aliasKey = normalizeAliasKey(aliasDisplay);
      if (!aliasKey) throw new Error('Agent name is empty after normalization');
      const { data: { user } } = await supabase.auth.getUser();

      // Check for existing active alias with this key (partial unique index).
      // PostgREST upsert doesn't reliably handle partial unique indexes,
      // so we do an explicit check-then-update/insert.
      const { data: existing } = await supabase
        .from('rc_agent_aliases')
        .select('id')
        .eq('org_id', orgId)
        .eq('alias_key', aliasKey)
        .eq('active', true)
        .maybeSingle();

      let data, error;
      if (existing) {
        // Update existing active alias
        ({ data, error } = await supabase
          .from('rc_agent_aliases')
          .update({
            alias_display: aliasDisplay,
            employee_user_id: employeeUserId,
            created_by: user?.id,
          })
          .eq('id', existing.id)
          .select()
          .single());
      } else {
        // Insert new alias; if a concurrent save created one first (TOCTOU race),
        // catch the unique constraint violation and fall back to update.
        ({ data, error } = await supabase
          .from('rc_agent_aliases')
          .insert({
            org_id: orgId,
            alias_key: aliasKey,
            alias_display: aliasDisplay,
            employee_user_id: employeeUserId,
            created_by: user?.id,
            source: 'manual',
            active: true,
          })
          .select()
          .single());

        if (error?.code === '23505') {
          // Unique violation — another admin won the race; update instead
          const { data: raced } = await supabase
            .from('rc_agent_aliases')
            .select('id')
            .eq('org_id', orgId)
            .eq('alias_key', aliasKey)
            .eq('active', true)
            .maybeSingle();
          if (raced) {
            ({ data, error } = await supabase
              .from('rc_agent_aliases')
              .update({
                alias_display: aliasDisplay,
                employee_user_id: employeeUserId,
                created_by: user?.id,
              })
              .eq('id', raced.id)
              .select()
              .single());
          }
        }
      }

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

/**
 * Preview how many rows a backfill would affect (read-only).
 * Returns { count } so the UI can show "This will update N calls. Continue?"
 *
 * Matches on employee_name_key (normalized) so that all whitespace/case/punctuation
 * variants of the same agent name are captured in a single backfill operation.
 */
export function useBackfillPreview() {
  return useMutation({
    mutationFn: async ({ orgId, nameKey }) => {
      const { count, error } = await supabase
        .from('rc_call_log')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .is('employee_user_id', null)
        .eq('employee_name_key', nameKey);

      if (error) throw error;
      return { count: count || 0 };
    },
  });
}

export function useBackfillAlias() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ orgId, nameKey, employeeUserId }) => {
      // Use server-side RPC that safely skips rows which would violate
      // the dedup UNIQUE constraint (same employee + start_time + direction + result).
      const { data, error } = await supabase
        .rpc('backfill_alias', {
          p_org_id: orgId,
          p_name_key: nameKey,
          p_employee_user_id: employeeUserId,
        });

      if (error) throw error;
      return { updated: data || 0 };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: employeeKeys.unmatchedAgents(variables.orgId) });
      // Invalidate call log data so scorecards reflect newly-attributed calls
      queryClient.invalidateQueries({ queryKey: ['cs-call-log'] });
    },
  });
}
