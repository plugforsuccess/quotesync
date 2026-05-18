// src/hooks/useCompSchedules.js
// CRUD operations, comparison-pair lookup, and rate I/O for comp schedules.
// Powers the schedule admin UI and the schedule comparison views.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

/**
 * @typedef {Object} Schedule
 * @property {string} id
 * @property {string} agency_id
 * @property {string} carrier_name
 * @property {string} state_code
 * @property {string} schedule_label
 * @property {string} effective_from        - ISO date
 * @property {string|null} effective_to     - ISO date or null
 * @property {boolean} is_announced_only
 * @property {string|null} notes
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} ScheduleStatus
 * @property {'active'|'announced'|'future'|'expired'} status
 * @property {string} colorToken
 * @property {string} label
 */

/** Fetch all schedules for an agency, sorted effective_from DESC. */
export function useAllSchedules(agencyId) {
  return useQuery({
    queryKey: queryKeys.compModel.schedules(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_comp_schedules')
        .select('*')
        .eq('agency_id', agencyId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch a single schedule by id. */
export function useSchedule(scheduleId) {
  return useQuery({
    queryKey: ['comp-model', 'schedule-detail', scheduleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_comp_schedules')
        .select('*')
        .eq('id', scheduleId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!scheduleId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch { current, announced } pair for a (carrier, state). */
export function useComparisonPair(agencyId, stateCode, carrierName = 'Allstate') {
  return useQuery({
    queryKey: queryKeys.compModel.comparisonPair(agencyId, stateCode, carrierName),
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);

      const { data: allMatch, error } = await supabase
        .from('agency_comp_schedules')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('state_code', stateCode)
        .eq('carrier_name', carrierName)
        .order('effective_from', { ascending: false });
      if (error) throw error;

      const current = (allMatch ?? []).find(s =>
        !s.is_announced_only &&
        s.effective_from <= today &&
        (s.effective_to === null || s.effective_to > today)
      ) ?? null;

      const announced = (allMatch ?? []).find(s => s.is_announced_only) ?? null;

      return { current, announced };
    },
    enabled: !!agencyId && !!stateCode,
    staleTime: 5 * 60 * 1000,
  });
}

/** Create a new schedule (optionally copying rates from an existing one). */
export function useCreateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.agency_id
     * @param {string} input.carrier_name
     * @param {string} input.state_code
     * @param {string} input.schedule_label
     * @param {string} input.effective_from   - ISO date
     * @param {string|null} input.effective_to
     * @param {boolean} input.is_announced_only
     * @param {string|null} input.notes
     * @param {string} [input.copy_rates_from_schedule_id]
     */
    mutationFn: async (input) => {
      const { copy_rates_from_schedule_id, ...scheduleInsert } = input;

      const { data: schedule, error } = await supabase
        .from('agency_comp_schedules')
        .insert(scheduleInsert)
        .select()
        .single();
      if (error) throw error;

      if (copy_rates_from_schedule_id) {
        const { error: rpcError } = await supabase.rpc('copy_comp_schedule_rates', {
          source_schedule_id: copy_rates_from_schedule_id,
          destination_schedule_id: schedule.id,
        });
        if (rpcError) {
          // Roll back the schedule we just created
          await supabase.from('agency_comp_schedules').delete().eq('id', schedule.id);
          throw rpcError;
        }
      }

      return schedule;
    },
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.compModel.schedules(schedule.agency_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.compModel.scheduleRates(schedule.id),
      });
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'comp-model' && q.queryKey[1] === 'comparison-pair' && q.queryKey[2] === schedule.agency_id,
      });
    },
  });
}

/** Update fields on a schedule. Does not touch rates. */
export function useUpdateSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.id
     * @param {string} [input.schedule_label]
     * @param {string} [input.effective_from]
     * @param {string|null} [input.effective_to]
     * @param {boolean} [input.is_announced_only]
     * @param {string|null} [input.notes]
     */
    mutationFn: async ({ id, ...changes }) => {
      const { data, error } = await supabase
        .from('agency_comp_schedules')
        .update(changes)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (schedule) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.compModel.schedules(schedule.agency_id),
      });
      queryClient.invalidateQueries({
        queryKey: ['comp-model', 'schedule-detail', schedule.id],
      });
      queryClient.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'comp-model' && q.queryKey[1] === 'comparison-pair' && q.queryKey[2] === schedule.agency_id,
      });
    },
  });
}

/** Delete a schedule. Cascades to its rates via FK ON DELETE CASCADE. */
export function useDeleteSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (scheduleId) => {
      // Fetch agency_id before delete for cache invalidation
      const { data: schedule } = await supabase
        .from('agency_comp_schedules')
        .select('agency_id')
        .eq('id', scheduleId)
        .single();

      const { error } = await supabase
        .from('agency_comp_schedules')
        .delete()
        .eq('id', scheduleId);
      if (error) throw error;

      return { id: scheduleId, agency_id: schedule?.agency_id };
    },
    onSuccess: ({ id, agency_id }) => {
      if (agency_id) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.compModel.schedules(agency_id),
        });
        queryClient.invalidateQueries({
          predicate: (q) =>
            q.queryKey[0] === 'comp-model' && q.queryKey[1] === 'comparison-pair' && q.queryKey[2] === agency_id,
        });
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.compModel.scheduleRates(id),
      });
    },
  });
}

/** Pure function: compute display status for a schedule. */
export function getScheduleStatus(schedule, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const { effective_from, effective_to, is_announced_only } = schedule;

  if (is_announced_only) {
    return { status: 'announced', colorToken: 'var(--qs-warning)', label: 'Announced' };
  }
  if (effective_to && effective_to <= today) {
    return { status: 'expired', colorToken: 'var(--qs-subtle)', label: 'Expired' };
  }
  if (effective_from > today) {
    return { status: 'future', colorToken: 'var(--qs-info)', label: 'Future' };
  }
  return { status: 'active', colorToken: 'var(--qs-success)', label: 'Active' };
}

/** Fetch rates for a single schedule, grouped by product_key. */
export function useScheduleRates(scheduleId) {
  return useQuery({
    queryKey: queryKeys.compModel.scheduleRates(scheduleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_commission_rates')
        .select('product_key, tier_key, rate')
        .eq('schedule_id', scheduleId);
      if (error) throw error;

      const grouped = {};
      for (const row of data ?? []) {
        if (!grouped[row.product_key]) grouped[row.product_key] = {};
        grouped[row.product_key][row.tier_key] = row.rate;
      }
      return grouped;
    },
    enabled: !!scheduleId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Replace all rates for a schedule with a new set. */
export function useSaveScheduleRates() {
  const queryClient = useQueryClient();
  return useMutation({
    /**
     * @param {Object} input
     * @param {string} input.scheduleId
     * @param {string} input.agencyId
     * @param {Array<{product_key: string, tier_key: string, rate: number}>} input.rates
     */
    mutationFn: async ({ scheduleId, agencyId, rates }) => {
      // Replace strategy: delete all existing rates for this schedule, then insert.
      const { error: delError } = await supabase
        .from('agency_commission_rates')
        .delete()
        .eq('schedule_id', scheduleId);
      if (delError) throw delError;

      const rows = rates
        .filter(r => r.rate !== null && r.rate !== '' && Number(r.rate) > 0)
        .map(r => ({
          agency_id: agencyId,
          schedule_id: scheduleId,
          product_key: r.product_key,
          tier_key: r.tier_key,
          rate: Number(r.rate),
        }));

      if (rows.length > 0) {
        const { error: insError } = await supabase
          .from('agency_commission_rates')
          .insert(rows);
        if (insError) throw insError;
      }

      return { scheduleId, count: rows.length };
    },
    onSuccess: ({ scheduleId }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.compModel.scheduleRates(scheduleId),
      });
      // Active schedule resolution caches may also be affected
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'comp-model' && q.queryKey[1] === 'schedule-rates',
      });
    },
  });
}
