import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// NOTE: `policyNo` is accepted for call-site compatibility but deliberately
// unused. A previous version matched siblings on the first 7 chars of the
// policy number, assuming the prefix identified one customer's account — it
// doesn't. Allstate policy numbers are issued sequentially, so two strangers
// who bought policies around the same time share a prefix (e.g. 885537743 /
// 885537765 belonged to two different customers and rendered each other's
// cases as household siblings). A live-book audit found the prefix never tied
// one customer's differently-named policies together — zero value, real false
// positives — so household identity here is the customer name, same as
// household_members.name_key and every other household mechanism in the app.
export function useOtherActiveCases({ agencyId, customerName, policyNo, excludeEventId, excludeRenewalId }) { // eslint-disable-line no-unused-vars
  // Require both first AND last name to reduce false positives
  const parts = customerName?.trim().split(/\s+/) || [];
  const firstName = parts.length > 1 ? parts[0] : '';
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : '';

  const hasNameMatch = firstName.length >= 2 && lastName.length >= 2;

  return useQuery({
    queryKey: ['other_active_cases', agencyId, lastName, firstName, excludeEventId, excludeRenewalId],
    queryFn: async () => {
      if (!agencyId || !hasNameMatch) return [];

      const TERMINAL         = ['saved', 'lost', 'auto_resolved', 'requested_cancellation', 'cancelled'];
      const RENEWAL_TERMINAL = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

      const matchFilter = `customer_name.ilike.${firstName} ${lastName}`;

      const [{ data: cancelCases }, { data: renewalCases }] = await Promise.all([
        supabase
          .from('pending_cases')
          .select('id, customer_name, policy_no, product, cancel_effective_date, status, stage, premium_at_risk')
          .eq('agency_id', agencyId)
          .or(matchFilter)
          .not('status', 'in', `(${TERMINAL.join(',')})`)
          .limit(10),

        supabase
          .from('renewal_cases')
          .select('id, customer_name, policy_no, product, renewal_date, status, premium')
          .eq('agency_id', agencyId)
          .or(matchFilter)
          .not('status', 'in', `(${RENEWAL_TERMINAL.join(',')})`)
          .limit(10),
      ]);

      const results = [];

      for (const c of (cancelCases || [])) {
        if (c.id === excludeEventId) continue;
        results.push({
          id: c.id, type: 'cancel',
          customer_name: c.customer_name, policy_no: c.policy_no,
          product: c.product, date: c.cancel_effective_date,
          status: c.status, stage: c.stage, premium: c.premium_at_risk,
        });
      }

      for (const r of (renewalCases || [])) {
        if (r.id === excludeRenewalId) continue;
        results.push({
          id: r.id, type: 'renewal',
          customer_name: r.customer_name, policy_no: r.policy_no,
          product: r.product, date: r.renewal_date,
          status: r.status, stage: null, premium: r.premium,
        });
      }

      return results;
    },
    enabled: !!agencyId && hasNameMatch,
    staleTime: 2 * 60 * 1000,
  });
}
