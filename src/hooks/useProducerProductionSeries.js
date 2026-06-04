// src/hooks/useProducerProductionSeries.js
// Per-producer monthly production (premium / items / policies) from
// revenue_entries over a trailing window. Powers the Production Goals
// workspace: trailing averages, last-month attainment, and sparklines.
//
// Attribution goes through the shared producer matcher so this stays in lockstep
// with the scorecard's monthly production figures.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useActiveEmployees } from './useEmployees';
import { buildProducerMatcher } from '../utils/producerMatch';

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Ordered list of YYYY-MM keys for the trailing window, oldest → newest.
function buildMonthKeys(months) {
  const now = new Date();
  const keys = [];
  for (let i = months - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return keys;
}

/**
 * @param {string} orgId
 * @param {{ months?: number }} [opts] trailing window length (default 6)
 * @returns {{ data: { monthKeys: string[], byEmployee: Object }, isLoading: boolean, error: any }}
 *   byEmployee is keyed by employees.id → {
 *     employee, months: [{ month, premium, items, policies }], (aligned to monthKeys)
 *     totalPremium, totalItems, totalPolicies
 *   }
 */
export function useProducerProductionSeries(orgId, { months = 6 } = {}) {
  const { data: roster = [], isLoading: rosterLoading } = useActiveEmployees(orgId);

  const now = new Date();
  const startStr = dateStr(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const endStr = dateStr(now);

  const { data: rows = [], isLoading: rowsLoading, error } = useQuery({
    queryKey: ['producer_production_series', orgId, startStr, endStr],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('revenue_entries')
        .select('producer_id, producer_name, premium, item_count, policy_count, issued_date')
        .eq('agency_id', orgId)
        .gte('issued_date', startStr)
        .lte('issued_date', endStr);
      if (qErr) throw qErr;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 2 * 60 * 1000,
  });

  const data = useMemo(() => {
    const monthKeys = buildMonthKeys(months);
    const monthIndex = new Map(monthKeys.map((k, i) => [k, i]));
    const match = buildProducerMatcher(roster);

    // Seed a zero-filled bucket set for every producer so sparklines are
    // uniform length even for months with no production.
    const byEmployee = {};
    for (const emp of roster) {
      byEmployee[emp.id] = {
        employee: emp,
        months: monthKeys.map((m) => ({ month: m, premium: 0, items: 0, policies: 0 })),
        totalPremium: 0,
        totalItems: 0,
        totalPolicies: 0,
      };
    }

    for (const r of rows) {
      // mapRow shape isn't applied here (raw select), so normalize field names
      // into the matcher's expected camelCase keys.
      const emp = match({ producerId: r.producer_id, producerName: r.producer_name });
      if (!emp) continue;
      const bucketSet = byEmployee[emp.id];
      if (!bucketSet) continue;
      const mk = r.issued_date ? r.issued_date.slice(0, 7) : null;
      const idx = mk != null ? monthIndex.get(mk) : undefined;
      if (idx === undefined) continue;

      const premium = parseFloat(r.premium) || 0;
      const items = r.item_count ?? 1;
      const policies = r.policy_count ?? 1;

      const bucket = bucketSet.months[idx];
      bucket.premium += premium;
      bucket.items += items;
      bucket.policies += policies;
      bucketSet.totalPremium += premium;
      bucketSet.totalItems += items;
      bucketSet.totalPolicies += policies;
    }

    return { monthKeys, byEmployee };
  }, [rows, roster, months]);

  return { data, isLoading: rosterLoading || rowsLoading, error };
}
