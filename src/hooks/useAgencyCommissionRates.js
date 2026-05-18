// src/hooks/useAgencyCommissionRates.js
// Fetches commission rates from agency_commission_rates + agency_comp_schedules
// tables and transforms them into the format expected by the dashboard
// (FunnelDashboardPage's CapacityPlanner, ScenariosTab, etc.).
//
// Schedule-aware: rates are now scoped to a versioned schedule. The hook
// resolves which schedule applies (by explicit id, or time/state/carrier
// lookup) and returns that schedule's rates while preserving the historical
// return shape so existing callers keep working.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// Mapping from DB tier keys to dashboard tier keys
const TIER_KEY_MAP = {
  preferred: 'preferredBundled',
  bundled: 'bundled',
  monoline: 'monoline',
};

// Mapping from DB product keys to dashboard product line labels
const PRODUCT_LABEL_MAP = {
  auto: 'Standard Auto',
  ho: 'Homeowners / Condo',
  renters: 'Other Personal Lines',
  landlord: 'Other Personal Lines',
  other: 'Other Personal Lines',
};

// Hardcoded defaults (Allstate new business commission schedule)
const DEFAULT_COMMISSION_MATRIX = {
  'Standard Auto':             { preferredBundled: 16, bundled: 11, monoline: 6 },
  'Homeowners / Condo':        { preferredBundled: 20, bundled: 16, monoline: 7 },
  'Other Personal Lines':      { preferredBundled: 17, bundled: 12, monoline: 6 },
};

const DEFAULT_BASE_COMMISSION = 9;

const DEFAULT_POLICY_MIX = [
  { productLine: 'Standard Auto',        tier: 'bundled',          avgPremium: 2200, mixPct: 40 },
  { productLine: 'Standard Auto',        tier: 'monoline',         avgPremium: 1800, mixPct: 20 },
  { productLine: 'Homeowners / Condo',   tier: 'preferredBundled', avgPremium: 2000, mixPct: 15 },
  { productLine: 'Homeowners / Condo',   tier: 'bundled',          avgPremium: 1800, mixPct: 10 },
  { productLine: 'Other Personal Lines', tier: 'monoline',         avgPremium: 1200, mixPct: 15 },
];

/**
 * @typedef {Object} CommissionRatesOptions
 * @property {Date} [asOf]           - Resolve schedule active as of this date (default: today)
 * @property {string} [scheduleId]   - Explicit schedule UUID; overrides asOf
 * @property {string} [stateCode]    - State code for schedule lookup (default: 'GA')
 * @property {string} [carrierName]  - Carrier name for schedule lookup (default: 'Allstate')
 * @property {boolean} [includeAnnouncedOnly]  - If true, allow announced-only schedules in lookup (default: false)
 */

/**
 * @typedef {Object} ActiveSchedule
 * @property {string} id
 * @property {string} label
 * @property {string} effectiveFrom   - ISO date string
 * @property {string|null} effectiveTo
 * @property {string} stateCode
 * @property {string} carrierName
 * @property {boolean} isAnnouncedOnly
 */

/**
 * @typedef {Object} CommissionRatesResult
 * @property {Object} commissionMatrix     - { [productLabel]: { [tierKey]: variableAboveBase } }
 * @property {number} baseCommission       - Base commission floor as percent (e.g. 9 for 9%)
 * @property {Array}  policyMix            - Default policy mix array (unchanged from before)
 * @property {boolean} isLoaded
 * @property {ActiveSchedule|null} activeSchedule
 * @property {ActiveSchedule[]} allSchedules
 */

/**
 * Fetch commission rates for an agency, scoped to a schedule version.
 *
 * @param {string} agencyId
 * @param {CommissionRatesOptions} [options]
 * @returns {CommissionRatesResult}
 */
export function useAgencyCommissionRates(agencyId, options = {}) {
  // ── Query A — All schedules for the agency ──────────────────────────────
  const { data: allSchedulesData } = useQuery({
    queryKey: queryKeys.compModel.schedules(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_comp_schedules')
        .select('id, schedule_label, effective_from, effective_to, state_code, carrier_name, is_announced_only')
        .eq('agency_id', agencyId)
        .order('effective_from', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Schedule resolution logic (memoized) ────────────────────────────────
  const resolvedScheduleId = useMemo(() => {
    if (options.scheduleId) return options.scheduleId;
    if (!allSchedulesData) return null;

    const asOf = options.asOf || new Date();
    const stateCode = options.stateCode || 'GA';
    const carrierName = options.carrierName || 'Allstate';
    const allowAnnounced = options.includeAnnouncedOnly === true;
    const asOfISO = asOf.toISOString().slice(0, 10);

    const matches = allSchedulesData
      .filter(s => s.state_code === stateCode)
      .filter(s => s.carrier_name === carrierName)
      .filter(s => allowAnnounced || !s.is_announced_only)
      .filter(s => s.effective_from <= asOfISO)
      .filter(s => s.effective_to === null || s.effective_to > asOfISO);

    if (matches.length === 0) return null;
    // allSchedulesData is sorted effective_from DESC, so matches[0] is the most recent.
    return matches[0].id;
  }, [
    options.scheduleId,
    options.asOf,
    options.stateCode,
    options.carrierName,
    options.includeAnnouncedOnly,
    allSchedulesData,
  ]);

  // ── Query B — Rates for the resolved schedule ───────────────────────────
  const { data: rates } = useQuery({
    queryKey: queryKeys.compModel.scheduleRates(resolvedScheduleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_commission_rates')
        .select('product_key, tier_key, rate')
        .eq('schedule_id', resolvedScheduleId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!resolvedScheduleId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Query C — Carrier config (unchanged) ────────────────────────────────
  const { data: carrierConfig } = useQuery({
    queryKey: ['agency_carrier_config', agencyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agency_carrier_config')
        .select('commissionable_factor, commission_goal, premium_goal, base_commission_floor')
        .eq('agency_id', agencyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!agencyId,
  });

  // ── Active schedule construction ────────────────────────────────────────
  const activeSchedule = useMemo(() => {
    if (!resolvedScheduleId || !allSchedulesData) return null;
    const s = allSchedulesData.find(x => x.id === resolvedScheduleId);
    if (!s) return null;
    return {
      id: s.id,
      label: s.schedule_label,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to,
      stateCode: s.state_code,
      carrierName: s.carrier_name,
      isAnnouncedOnly: s.is_announced_only,
    };
  }, [resolvedScheduleId, allSchedulesData]);

  // ── allSchedules return value ───────────────────────────────────────────
  const allSchedules = useMemo(() => {
    if (!allSchedulesData) return [];
    return allSchedulesData.map(s => ({
      id: s.id,
      label: s.schedule_label,
      effectiveFrom: s.effective_from,
      effectiveTo: s.effective_to,
      stateCode: s.state_code,
      carrierName: s.carrier_name,
      isAnnouncedOnly: s.is_announced_only,
    }));
  }, [allSchedulesData]);

  // MT-07: Use per-agency base commission floor from DB when available
  const baseCommission = carrierConfig?.base_commission_floor
    ? Number(carrierConfig.base_commission_floor)
    : DEFAULT_BASE_COMMISSION;

  // If we have DB rates, transform them into the dashboard format
  if (rates && rates.length > 0) {
    const matrix = {};

    for (const row of rates) {
      const productLabel = PRODUCT_LABEL_MAP[row.product_key] || row.product_key;
      const tierKey = TIER_KEY_MAP[row.tier_key] || row.tier_key;

      if (!matrix[productLabel]) {
        matrix[productLabel] = {};
      }
      // Convert decimal rate to whole-number variable commission (rate * 100 - base)
      // The DB stores total rate as decimal. The dashboard uses base + variable.
      // E.g., DB: 0.25 (25%) → base=9, variable=16
      const totalPct = Math.round(row.rate * 100);
      matrix[productLabel][tierKey] = totalPct - baseCommission;
    }

    return {
      commissionMatrix: matrix,
      baseCommission,
      policyMix: DEFAULT_POLICY_MIX,
      isLoaded: true,
      activeSchedule,
      allSchedules,
    };
  }

  // Fallback: no rates resolved (or no schedule), use defaults.
  return {
    commissionMatrix: DEFAULT_COMMISSION_MATRIX,
    baseCommission,
    policyMix: DEFAULT_POLICY_MIX,
    isLoaded: true,
    activeSchedule,
    allSchedules,
  };
}
