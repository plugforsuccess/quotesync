// src/hooks/useTimeAttendance.js
// Shared React Query hooks for Time & Attendance and CS Performance pages.
// Both pages use identical query keys so the QueryClient cache (2min staleTime)
// prevents redundant refetches when navigating between them.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Query key factories ─────────────────────────────────────────────────────

export const timeAttendanceKeys = {
  timeEntries: (weekStart, employeeId) =>
    ['time-entries', weekStart, employeeId || 'all'],
  rcData: (weekStart, employeeId) =>
    ['rc-performance', weekStart, employeeId || 'all'],
  proactivity: (weekStart, employeeId) =>
    ['cs-proactivity', weekStart, employeeId || 'all'],
  allEmployees: () => ['employees', 'platform-users'],
};

// ── Fetch functions ─────────────────────────────────────────────────────────

async function fetchTimeEntries(weekStart, selectedEmployee) {
  let query = supabase
    .from('employee_time_entries')
    .select('*')
    .eq('week_start', weekStart)
    .order('work_date', { ascending: true });

  if (selectedEmployee && selectedEmployee !== 'all') {
    query = query.eq('employee_user_id', selectedEmployee);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Also fetch profile names for the employees found in entries
  const uniqueIds = [...new Set((data || []).map((e) => e.employee_user_id))];
  let profiles = [];
  if (uniqueIds.length > 0) {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', uniqueIds);
    profiles = profileData || [];
  }

  return { entries: data || [], employees: profiles };
}

async function fetchRCData(weekStart, selectedEmployee) {
  let query = supabase
    .from('rc_performance_data')
    .select('*')
    .eq('week_start', weekStart);

  if (selectedEmployee && selectedEmployee !== 'all') {
    query = query.eq('employee_user_id', selectedEmployee);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchProactivityData(weekStart, selectedEmployee) {
  let query = supabase
    .from('cs_proactivity_manual')
    .select('*')
    .eq('week_start', weekStart);

  if (selectedEmployee && selectedEmployee !== 'all') {
    query = query.eq('employee_user_id', selectedEmployee);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchAllPlatformEmployees() {
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('is_platform_user', true)
    .order('full_name');
  return data || [];
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useTimeEntries(weekStart, selectedEmployee) {
  return useQuery({
    queryKey: timeAttendanceKeys.timeEntries(weekStart, selectedEmployee),
    queryFn: () => fetchTimeEntries(weekStart, selectedEmployee),
    // Keep defaults from QueryClient (staleTime: 2min, cacheTime: 10min)
  });
}

export function useRCData(weekStart, selectedEmployee) {
  return useQuery({
    queryKey: timeAttendanceKeys.rcData(weekStart, selectedEmployee),
    queryFn: () => fetchRCData(weekStart, selectedEmployee),
  });
}

export function useProactivityData(weekStart, selectedEmployee) {
  return useQuery({
    queryKey: timeAttendanceKeys.proactivity(weekStart, selectedEmployee),
    queryFn: () => fetchProactivityData(weekStart, selectedEmployee),
  });
}

export function useAllEmployees() {
  return useQuery({
    queryKey: timeAttendanceKeys.allEmployees(),
    queryFn: fetchAllPlatformEmployees,
    staleTime: 5 * 60 * 1000, // Employee list rarely changes — 5 min stale
  });
}

// ── Invalidation helper (for mutations like approval toggle, RC upload) ─────

export function useInvalidateTimeData() {
  const queryClient = useQueryClient();

  return {
    invalidateTimeEntries: (weekStart, selectedEmployee) =>
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.timeEntries(weekStart, selectedEmployee),
      }),
    invalidateRCData: (weekStart, selectedEmployee) =>
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.rcData(weekStart, selectedEmployee),
      }),
    invalidateProactivity: (weekStart, selectedEmployee) =>
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.proactivity(weekStart, selectedEmployee),
      }),
    invalidateAll: (weekStart, selectedEmployee) => {
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.timeEntries(weekStart, selectedEmployee),
      });
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.rcData(weekStart, selectedEmployee),
      });
      queryClient.invalidateQueries({
        queryKey: timeAttendanceKeys.proactivity(weekStart, selectedEmployee),
      });
    },
  };
}
