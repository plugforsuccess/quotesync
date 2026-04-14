// src/hooks/useManagementCadence.js
// Reads cadence_events to determine management cadence status.
// Provides logCadenceEvent() for quick-logging from the checklist.
// Does NOT replace the full agenda page — that's for structured meetings.
// This is the lightweight "did it happen this period" signal.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// The 4 cadence types tracked in the checklist.
// morning_huddle is daily and excluded — too frequent for modal display.
export const CHECKLIST_CADENCES = [
  {
    key: 'weekly_checkin',
    label: 'Weekly Check-In',
    description: '5–10 min · Call metrics, open cases, commitment review',
    cadenceDays: 7,
    icon: '📅',
  },
  {
    key: 'monthly_scorecard',
    label: 'Monthly Scorecard Review',
    description: '30 min · Full scorecard, VC baseline, attendance summary',
    cadenceDays: 31,
    icon: '📊',
  },
  {
    key: 'quarterly_comp',
    label: 'Quarterly Comp & Goals Review',
    description: '60 min · Compensation structure, targets, contract review',
    cadenceDays: 90,
    icon: '💼',
  },
  {
    key: 'annual_evaluation',
    label: 'Annual Performance Evaluation',
    description: 'Full written evaluation · Contract renewal, profit sharing',
    cadenceDays: 365,
    icon: '📋',
  },
];

// Overdue morning huddles — shown in bell badge only, not modal
const MORNING_HUDDLE_DAYS = 1;

function getCadenceStatus(lastConductedAt, cadenceDays) {
  if (!lastConductedAt) return 'overdue'; // never conducted

  const last = new Date(lastConductedAt);
  const daysSince = Math.floor((Date.now() - last.getTime()) / 86400000);

  if (daysSince < cadenceDays * 0.8) return 'current';  // well within cadence
  if (daysSince < cadenceDays)        return 'due';      // approaching
  return 'overdue';                                       // past cadence
}

function daysSinceLabel(lastConductedAt) {
  if (!lastConductedAt) return 'Never conducted';
  const days = Math.floor((Date.now() - new Date(lastConductedAt).getTime()) / 86400000);
  if (days === 0) return 'Conducted today';
  if (days === 1) return 'Conducted yesterday';
  return `Last conducted ${days} days ago`;
}

export function useManagementCadence(agencyId) {
  const queryClient = useQueryClient();

  const { data: cadenceStatus = [], isLoading } = useQuery({
    queryKey: ['management_cadence_checklist', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      // Fetch most recent cadence_event per type for this agency.
      // Uses cadence_type (NOT review_type — that table is gone).
      const { data, error } = await supabase
        .from('cadence_events')
        .select('cadence_type, conducted_at, employee_id')
        .eq('agency_id', agencyId)
        .in('cadence_type', [
          'morning_huddle',
          'weekly_checkin',
          'monthly_scorecard',
          'quarterly_comp',
          'annual_evaluation',
        ])
        .order('conducted_at', { ascending: false });

      if (error) throw error;

      // Get most recent per type
      const lastByType = {};
      for (const row of data || []) {
        if (!lastByType[row.cadence_type]) {
          lastByType[row.cadence_type] = row;
        }
      }

      return CHECKLIST_CADENCES.map(c => ({
        ...c,
        lastConductedAt: lastByType[c.key]?.conducted_at || null,
        status: getCadenceStatus(
          lastByType[c.key]?.conducted_at || null,
          c.cadenceDays
        ),
        daysSinceLabel: daysSinceLabel(lastByType[c.key]?.conducted_at || null),
        // morning_huddle overdue count for bell badge
        morningHuddleOverdue: lastByType['morning_huddle']
          ? Math.floor(
              (Date.now() - new Date(lastByType['morning_huddle'].conducted_at).getTime())
              / 86400000
            ) >= MORNING_HUDDLE_DAYS
          : false,
      }));
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // Quick-log a cadence event from the checklist.
  // This is for lightweight "did it happen" logging.
  // Full structured meetings go through the cadence agenda page.
  async function logCadenceEvent(cadenceType, employeeId = null, notes = null) {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('cadence_events')
      .insert({
        agency_id:         agencyId,
        cadence_type:      cadenceType,
        employee_id:       employeeId || null,
        conducted_by:      user.id,
        conducted_at:      new Date().toISOString(),
        agency_cadence_id: null, // nullable — direct log, not from agenda page
        notes:             notes || null,
      });

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['management_cadence_checklist', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['upload_checklist', agencyId] });
    }

    return { error };
  }

  // Per-employee agency_cadences that are past their next_due_at.
  // Deep-links straight to the agenda page for each one.
  const { data: overdueCadences = [] } = useQuery({
    queryKey: ['overdue_cadences', agencyId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('agency_cadences')
        .select('*, employees(first_name, last_name), cadence_templates(label)')
        .eq('agency_id', agencyId)
        .eq('active', true)
        .lt('next_due_at', now)
        .order('next_due_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // Commitments past their due_date that haven't been closed yet
  const { data: overdueCommitments = [] } = useQuery({
    queryKey: ['overdue_commitments', agencyId],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('cadence_commitments')
        .select('id, description, due_date, cadence_type, employee_id, employees(first_name, last_name)')
        .eq('agency_id', agencyId)
        .eq('closed', false)
        .lt('due_date', today);
      if (error) throw error;
      return data || [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // Total actionable count for bell badge:
  // overdue/due quick-log cadences + per-employee overdue agenda cadences
  // + overdue commitments
  const actionableCount = cadenceStatus.filter(
    c => c.status === 'due' || c.status === 'overdue'
  ).length + overdueCadences.length + overdueCommitments.length;

  return {
    cadenceStatus,
    isLoading,
    logCadenceEvent,
    actionableCount,
    overdueCadences,
    overdueCommitments,
  };
}
