import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useOtherActiveCases({ agencyId, customerName, policyNo, excludeEventId, excludeRenewalId }) {
  // Policy prefix — first 7 chars identify the Allstate customer account
  const policyPrefix = policyNo?.slice(0, 7) || '';

  // Name fallback — require both first AND last name to reduce false positives
  const parts = customerName?.trim().split(/\s+/) || [];
  const firstName = parts.length > 1 ? parts[0] : '';
  const lastName  = parts.length > 1 ? parts[parts.length - 1] : '';

  const hasPolicyMatch = policyPrefix.length >= 7;
  const hasNameMatch   = firstName.length >= 2 && lastName.length >= 2;

  return useQuery({
    queryKey: ['other_active_cases', agencyId, policyPrefix, lastName, firstName, excludeEventId, excludeRenewalId],
    queryFn: async () => {
      if (!agencyId || (!hasPolicyMatch && !hasNameMatch)) return [];

      const TERMINAL         = ['saved', 'lost', 'auto_resolved', 'requested_cancellation', 'cancelled'];
      const RENEWAL_TERMINAL = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

      // Match on policy prefix OR full name — BOTH when available. The prefix
      // only finds sibling policies in the same number series; a customer's
      // auto and property policies are different series entirely (this hid a
      // same-day home renewal from an auto case's detail), so the name match
      // must run alongside the prefix, not as a fallback.
      const matchFilter = [
        hasPolicyMatch ? `policy_no.ilike.${policyPrefix}%` : null,
        hasNameMatch   ? `customer_name.ilike.${firstName} ${lastName}` : null,
      ].filter(Boolean).join(',');

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
    enabled: !!agencyId && (hasPolicyMatch || hasNameMatch),
    staleTime: 2 * 60 * 1000,
  });
}
