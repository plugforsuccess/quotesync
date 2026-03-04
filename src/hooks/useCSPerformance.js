// src/hooks/useCSPerformance.js
// React Query hooks for CS Performance Dashboard v2 features:
// - Per-employee targets
// - Manual proactivity assessments
// - Outbound call breakdown
// - 8-week trend data
// - Team-wide data

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Query key factories ─────────────────────────────────────────────────────

export const csPerformanceKeys = {
  targets: (employeeId) => ['cs-targets', employeeId],
  proactivity: (employeeId, weekStart) => ['cs-proactivity', employeeId, weekStart],
  outboundBreakdown: (employeeId, weekStart) => ['cs-outbound-breakdown', employeeId, weekStart],
  trendData: (employeeId, weekStart) => ['cs-trend', employeeId, weekStart],
  teamData: (weekStart) => ['cs-team', weekStart],
};

// ── Per-Employee Targets ────────────────────────────────────────────────────

async function fetchTargets(employeeId, weekStart) {
  if (!employeeId || employeeId === 'all') return null;

  const { data, error } = await supabase
    .from('cs_performance_targets')
    .select('*')
    .eq('employee_user_id', employeeId)
    .lte('effective_date', weekStart)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useEmployeeTargets(employeeId, weekStart) {
  return useQuery({
    queryKey: csPerformanceKeys.targets(employeeId),
    queryFn: () => fetchTargets(employeeId, weekStart),
    enabled: !!employeeId && employeeId !== 'all',
    staleTime: 5 * 60 * 1000,
  });
}

export function useSaveTargets() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targets) => {
      const { data, error } = await supabase
        .from('cs_performance_targets')
        .upsert(targets, { onConflict: 'employee_user_id,effective_date' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: csPerformanceKeys.targets(data.employee_user_id),
      });
    },
  });
}

// ── Manual Proactivity Assessments ──────────────────────────────────────────

async function fetchProactivity(employeeId, weekStart) {
  if (!employeeId || employeeId === 'all') return null;

  const { data, error } = await supabase
    .from('cs_proactivity_manual')
    .select('*')
    .eq('employee_user_id', employeeId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useProactivityManual(employeeId, weekStart) {
  return useQuery({
    queryKey: csPerformanceKeys.proactivity(employeeId, weekStart),
    queryFn: () => fetchProactivity(employeeId, weekStart),
    enabled: !!employeeId && employeeId !== 'all',
  });
}

export function useSaveProactivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record) => {
      const { data, error } = await supabase
        .from('cs_proactivity_manual')
        .upsert(record, { onConflict: 'employee_user_id,week_start' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: csPerformanceKeys.proactivity(data.employee_user_id, data.week_start),
      });
    },
  });
}

// ── Outbound Call Breakdown ─────────────────────────────────────────────────

async function fetchOutboundBreakdown(employeeId, weekStart) {
  if (!employeeId || employeeId === 'all') return null;

  const { data, error } = await supabase
    .from('cs_outbound_breakdown')
    .select('*')
    .eq('employee_user_id', employeeId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function useOutboundBreakdown(employeeId, weekStart) {
  return useQuery({
    queryKey: csPerformanceKeys.outboundBreakdown(employeeId, weekStart),
    queryFn: () => fetchOutboundBreakdown(employeeId, weekStart),
    enabled: !!employeeId && employeeId !== 'all',
  });
}

export function useSaveOutboundBreakdown() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (record) => {
      const { data, error } = await supabase
        .from('cs_outbound_breakdown')
        .upsert(record, { onConflict: 'employee_user_id,week_start' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: csPerformanceKeys.outboundBreakdown(data.employee_user_id, data.week_start),
      });
    },
  });
}

// ── 8-Week Trend Data ───────────────────────────────────────────────────────

async function fetchTrendData(employeeId, weekStart) {
  if (!employeeId || employeeId === 'all') return [];

  // Calculate 7 weeks back from the selected week
  const currentWeek = new Date(weekStart + 'T00:00:00');
  const startWeek = new Date(currentWeek);
  startWeek.setDate(startWeek.getDate() - 7 * 7); // 7 weeks back = 8 weeks total
  const y = startWeek.getFullYear();
  const m = String(startWeek.getMonth() + 1).padStart(2, '0');
  const d = String(startWeek.getDate()).padStart(2, '0');
  const startWeekStr = `${y}-${m}-${d}`;

  const { data, error } = await supabase
    .from('rc_performance_data')
    .select('*')
    .eq('employee_user_id', employeeId)
    .gte('week_start', startWeekStr)
    .lte('week_start', weekStart)
    .order('week_start', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function useTrendData(employeeId, weekStart) {
  return useQuery({
    queryKey: csPerformanceKeys.trendData(employeeId, weekStart),
    queryFn: () => fetchTrendData(employeeId, weekStart),
    enabled: !!employeeId && employeeId !== 'all',
    staleTime: 2 * 60 * 1000,
  });
}

// ── Team Data (all employees for a week, with role info) ────────────────────

async function fetchTeamData(weekStart) {
  // Fetch all RC performance data for the selected week
  const { data: rcData, error: rcError } = await supabase
    .from('rc_performance_data')
    .select('*')
    .eq('week_start', weekStart);

  if (rcError) throw rcError;

  if (!rcData || rcData.length === 0) return { rcData: [], targets: {}, employees: {} };

  // Fetch targets for all employees found
  const employeeIds = [...new Set(rcData.map((r) => r.employee_user_id))];

  const [targetsResult, employeesResult] = await Promise.all([
    supabase
      .from('cs_performance_targets')
      .select('*')
      .in('employee_user_id', employeeIds)
      .lte('effective_date', weekStart)
      .order('effective_date', { ascending: false }),
    supabase
      .from('employees')
      .select('id, auth_user_id, first_name, last_name, preferred_name, role_type')
      .in('auth_user_id', employeeIds),
  ]);

  if (targetsResult.error) throw targetsResult.error;
  if (employeesResult.error) throw employeesResult.error;

  // Build a map of employee_user_id -> most recent targets
  const targetsMap = {};
  for (const t of (targetsResult.data || [])) {
    if (!targetsMap[t.employee_user_id]) {
      targetsMap[t.employee_user_id] = t;
    }
  }

  // Build a map of auth_user_id -> employee data (with role_type)
  const employeesMap = {};
  for (const emp of (employeesResult.data || [])) {
    const key = emp.auth_user_id || emp.id;
    employeesMap[key] = emp;
  }

  return { rcData: rcData || [], targets: targetsMap, employees: employeesMap };
}

export function useTeamData(weekStart) {
  return useQuery({
    queryKey: csPerformanceKeys.teamData(weekStart),
    queryFn: () => fetchTeamData(weekStart),
    staleTime: 2 * 60 * 1000,
  });
}
