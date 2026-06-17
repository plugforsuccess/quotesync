// src/hooks/useRenewalPremiumAudit.js
// Renewal premium audit — for every renewal with a recorded paid amount, the
// offer (from the report) vs the paid amount and the signed difference, plus an
// agency rollup. The audit of "did we renew at, above, or below the offer, and
// by how much." Includes auto-resolved renewals (customer paid the offer in
// full before we reached them) — marked distinctly since they carry no rep
// save credit and always sit at the offer (difference $0).
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRenewalPremiumAudit(agencyId) {
  return useQuery({
    queryKey: ['renewal_premium_audit', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const [{ data: renewals }, { data: emps }] = await Promise.all([
        supabase
          .from('renewal_cases')
          .select('id, customer_name, premium, saved_premium, resolution_date, closed_by_id, policy_no, status')
          .eq('agency_id', agencyId)
          .in('status', ['confirmed', 'auto_resolved'])
          .not('premium', 'is', null)
          .order('resolution_date', { ascending: false }),
        supabase
          .from('employees')
          .select('id, first_name, last_name, preferred_name')
          .eq('org_id', agencyId),
      ]);

      const empName = {};
      for (const e of emps || []) {
        empName[e.id] = e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim();
      }

      const rows = (renewals || []).map(r => {
        const offer = Number(r.premium) || 0;
        const auto = r.status === 'auto_resolved';
        // Auto-resolved = the customer paid the offer in full before we reached
        // them, so paid defaults to the offer (difference $0) when no explicit
        // amount was recorded — covers import/cron closes as well as the manual
        // "already paid" clear. Confirmed rows need a recorded paid amount.
        const paidRaw = r.saved_premium != null ? Number(r.saved_premium) : (auto ? offer : null);
        if (paidRaw == null) return null;
        const paid = paidRaw || 0;
        const diff = paid - offer; // + above offer, − below
        return {
          id: r.id, customer_name: r.customer_name, policy_no: r.policy_no,
          resolution_date: r.resolution_date, rep: empName[r.closed_by_id] || null,
          offer, paid, diff,
          pct: offer > 0 ? (diff / offer) * 100 : 0,
          autoResolved: auto,
        };
      }).filter(Boolean);

      const totalOffer = rows.reduce((s, r) => s + r.offer, 0);
      const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
      const netDiff = totalPaid - totalOffer;
      const below = rows.filter(r => r.diff < 0).length;
      const above = rows.filter(r => r.diff > 0).length;
      const atOffer = rows.filter(r => r.diff === 0).length;
      const autoPaid = rows.filter(r => r.autoResolved).length;

      return {
        rows,
        count: rows.length,
        totalOffer, totalPaid, netDiff,
        avgDiff: rows.length ? netDiff / rows.length : 0,
        below, above, atOffer, autoPaid,
      };
    },
  });
}
