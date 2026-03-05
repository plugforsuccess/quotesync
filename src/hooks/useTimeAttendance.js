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
  ytdEntries: (year) =>
    ['time-entries-ytd', year],
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

  // Resolve employee names from the employees table (matching on auth_user_id)
  const uniqueIds = [...new Set((data || []).map((e) => e.employee_user_id))];
  let employeeProfiles = [];
  if (uniqueIds.length > 0) {
    const { data: empData } = await supabase
      .from('employees')
      .select('id, first_name, last_name, preferred_name, auth_user_id')
      .in('auth_user_id', uniqueIds);
    // Map to shape expected by consumers (id = auth_user_id, full_name computed)
    employeeProfiles = (empData || []).map((emp) => ({
      id: emp.auth_user_id || emp.id,
      full_name: `${emp.preferred_name || emp.first_name} ${emp.last_name}`.trim(),
    }));
  }

  return { entries: data || [], employees: employeeProfiles };
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

async function fetchYTDEntries(year) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  const { data, error } = await supabase
    .from('employee_time_entries')
    .select('*')
    .gte('work_date', startDate)
    .lte('work_date', endDate)
    .order('work_date', { ascending: true });

  if (error) throw error;

  // Resolve employee names
  const uniqueIds = [...new Set((data || []).map((e) => e.employee_user_id))];
  let employeeProfiles = [];
  if (uniqueIds.length > 0) {
    const { data: empData } = await supabase
      .from('employees')
      .select('id, first_name, last_name, preferred_name, auth_user_id')
      .in('auth_user_id', uniqueIds);
    employeeProfiles = (empData || []).map((emp) => ({
      id: emp.auth_user_id || emp.id,
      full_name: `${emp.preferred_name || emp.first_name} ${emp.last_name}`.trim(),
    }));
  }

  return { entries: data || [], employees: employeeProfiles };
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

export function useYTDEntries(year, enabled = false) {
  return useQuery({
    queryKey: timeAttendanceKeys.ytdEntries(year),
    queryFn: () => fetchYTDEntries(year),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — YTD data is heavier
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
