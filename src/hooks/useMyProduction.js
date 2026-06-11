// src/hooks/useMyProduction.js
// A producer's OWN monthly production (premium / items / policies) from
// revenue_entries over a trailing window. Powers the producer-facing goal
// tracker on My Scorecard.
//
// Attribution reuses the shared producer matcher, but built over just the
// current employee — so it needs no access to the full roster (a producer can
// read their own employee record and their agency's revenue_entries under RLS,
// which is all this requires).

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { buildProducerMatcher } from '../utils/producerMatch';

function dateStr(d) {
  return d.toISOString().slice(0, 10);
}
function monthKey(y, mZeroBased) {
  return `${y}-${String(mZeroBased + 1).padStart(2, '0')}`;
}

/**
 * @param {string} orgId
 * @param {object} employee - the current employee record (from useCurrentEmployee)
 * @param {{ months?: number }} [opts] trailing window length (default 6)
 * @returns {{ data: { months: Array<{month,premium,items,policies}>, mtd: object }, isLoading, error }}
 *   months are aligned oldest → newest; mtd is the current (last) bucket.
 */
export function useMyProduction(orgId, employee, { months = 6 } = {}) {
  const now = new Date();
  const startStr = dateStr(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
  const endStr = dateStr(now);
  const empId = employee?.id;

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['my_production', orgId, empId, startStr, endStr],
    queryFn: async () => {
      const { data, error: qErr } = await supabase
        .from('revenue_entries')
        .select('producer_id, producer_name, premium, item_count, policy_count, issued_date')
        .eq('agency_id', orgId)
        .is('charged_back_at', null)
        .gte('issued_date', startStr)
        .lte('issued_date', endStr);
      if (qErr) throw qErr;
      return data || [];
    },
    enabled: !!orgId && !!empId,
    staleTime: 2 * 60 * 1000,
  });

  const data = useMemo(() => {
    // Build month buckets from the stable startStr so the set doesn't churn.
    const [sy, sm] = startStr.split('-').map(Number); // sm is 1-based
    const keys = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(sy, sm - 1 + i, 1);
      keys.push(monthKey(d.getFullYear(), d.getMonth()));
    }
    const idxOf = new Map(keys.map((k, i) => [k, i]));
    const buckets = keys.map((m) => ({ month: m, premium: 0, items: 0, policies: 0 }));

    const match = buildProducerMatcher(employee ? [employee] : []);
    for (const r of rows) {
      const emp = match({ producerId: r.producer_id, producerName: r.producer_name });
      if (!emp) continue; // not this producer's entry
      const mk = r.issued_date ? r.issued_date.slice(0, 7) : null;
      const idx = mk != null ? idxOf.get(mk) : undefined;
      if (idx === undefined) continue;
      buckets[idx].premium += parseFloat(r.premium) || 0;
      buckets[idx].items += r.item_count ?? 1;
      buckets[idx].policies += r.policy_count ?? 1;
    }
    return { months: buckets, mtd: buckets[buckets.length - 1] || { premium: 0, items: 0, policies: 0 } };
  }, [rows, employee, months, startStr]);

  return { data, isLoading, error };
}
