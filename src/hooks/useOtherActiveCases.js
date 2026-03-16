import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Returns other active cases for the same customer (by last name match)
// excluding the current event/row being viewed.
export function useOtherActiveCases({ agencyId, customerName, excludeEventId, excludeRenewalId }) {
  const lastName = customerName?.trim().split(/\s+/).pop() || '';

  return useQuery({
    queryKey: ['other_active_cases', agencyId, lastName, excludeEventId, excludeRenewalId],
    queryFn: async () => {
      if (!agencyId || !lastName || lastName.length < 3) return [];

      const TERMINAL = ['saved', 'lost', 'auto_resolved', 'requested_cancellation', 'cancelled'];
      const RENEWAL_TERMINAL = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

      const [{ data: cancelCases }, { data: renewalCases }] = await Promise.all([
        supabase
          .from('pending_cancel_events')
          .select('id, customer_name, policy_no, product, cancel_effective_date, status, stage, premium_at_risk')
          .eq('agency_id', agencyId)
          .ilike('customer_name', `%${lastName}%`)
          .not('status', 'in', `(${TERMINAL.join(',')})`)
          .limit(10),

        supabase
          .from('renewal_events')
          .select('id, customer_name, policy_no, product, renewal_date, status, premium')
          .eq('agency_id', agencyId)
          .ilike('customer_name', `%${lastName}%`)
          .not('status', 'in', `(${RENEWAL_TERMINAL.join(',')})`)
          .limit(10),
      ]);

      const results = [];

      // Cancel cases — exclude the current one
      for (const c of (cancelCases || [])) {
        if (c.id === excludeEventId) continue;
        results.push({
          id: c.id,
          type: 'cancel',
          customer_name: c.customer_name,
          policy_no: c.policy_no,
          product: c.product,
          date: c.cancel_effective_date,
          status: c.status,
          stage: c.stage,
          premium: c.premium_at_risk,
        });
      }

      // Renewal cases — exclude the current one
      for (const r of (renewalCases || [])) {
        if (r.id === excludeRenewalId) continue;
        results.push({
          id: r.id,
          type: 'renewal',
          customer_name: r.customer_name,
          policy_no: r.policy_no,
          product: r.product,
          date: r.renewal_date,
          status: r.status,
          stage: null,
          premium: r.premium,
        });
      }

      return results;
    },
    enabled: !!agencyId && !!lastName && lastName.length >= 3,
    staleTime: 2 * 60 * 1000,
  });
}
