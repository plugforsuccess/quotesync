// src/hooks/useWinbackLapses.js
// Recent lost lines (last 18 months) keyed by household, so the renewal queue
// can flag a customer who lost ANOTHER line — a warm win-back / bundle pitch to
// make while the rep already has them on the renewal call. Same household-match
// + non-winnable filter the cross-sell page uses, shared here.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const NON_WINNABLE_RX = /\b(moved|sold|deceased|death|total loss|no longer|relocat)\b/i;

const householdKey = (name, zip) =>
  `${(name || '').toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim()}|${(zip || '').slice(0, 5)}`;

export function useWinbackLapses(agencyId) {
  const { data: map = null } = useQuery({
    queryKey: ['winback_lapses', agencyId],
    enabled: !!agencyId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 18);
      const { data, error } = await supabase
        .from('lapse_events')
        .select('customer_name, zip, product, lapse_date, termination_reason')
        .eq('agency_id', agencyId)
        .gte('lapse_date', since.toISOString().slice(0, 10));
      if (error) throw error;
      const m = new Map();
      for (const l of data || []) {
        if (l.termination_reason && NON_WINNABLE_RX.test(l.termination_reason)) continue;
        // Index by name+zip AND name-only (renewal rows may lack zip).
        for (const k of [householdKey(l.customer_name, l.zip), householdKey(l.customer_name, null)]) {
          const prev = m.get(k);
          if (!prev || (l.lapse_date || '') > (prev.lapse_date || '')) m.set(k, l);
        }
      }
      return m;
    },
  });
  return map;
}

// Returns { product, months, reason } when the customer lost a DIFFERENT line
// recently (a win-back), else null.
export function winbackFor(map, customerName, zip, currentProduct) {
  if (!map) return null;
  const lost = map.get(householdKey(customerName, zip)) || map.get(householdKey(customerName, null));
  if (!lost || !lost.product || lost.product === currentProduct) return null;
  const months = Math.max(0, Math.round(
    (Date.now() - new Date(lost.lapse_date + 'T00:00:00')) / (1000 * 60 * 60 * 24 * 30.44)
  ));
  return { product: lost.product, months, reason: lost.termination_reason };
}
