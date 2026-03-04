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

// ── Active CS reps for Performance team view ────────────────────────────────

export function useActiveCSReps(orgId) {
  return useQuery({
    queryKey: ['employees', 'cs-reps', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, preferred_name, role_type, auth_user_id')
        .eq('org_id', orgId)
        .eq('employment_status', 'active')
        .eq('role_type', 'cs_rep');

      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── RC display name map for XLSX upload matching ────────────────────────────

export function useRCEmployeeMap(orgId) {
  return useQuery({
    queryKey: ['employees', 'rc-map', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, first_name, last_name, rc_display_name, auth_user_id')
        .eq('org_id', orgId)
        .eq('employment_status', 'active');

      if (error) throw error;

      // Build name -> auth_user_id map for RC upload matching
      const map = {};
      (data || []).forEach((emp) => {
        if (emp.rc_display_name) {
          map[emp.rc_display_name] = emp.auth_user_id || emp.id;
        }
        // Also map full name as fallback
        const fullName = `${emp.first_name} ${emp.last_name}`;
        if (!map[fullName]) {
          map[fullName] = emp.auth_user_id || emp.id;
        }
      });
      return map;
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}
