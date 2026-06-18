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
          .select('id, customer_name, premium, premium_change, saved_premium, resolution_date, closed_by_id, policy_no, status')
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
        // Realized increase vs the customer's PRIOR premium — the rate change
        // they actually pay. prior = offer − the report's premium_change (the
        // rate shock). This is the "are we growing premium per policy" number.
        const priorRaw = r.premium_change != null ? offer - Number(r.premium_change) : null;
        const prior = priorRaw != null && priorRaw > 0 ? priorRaw : null; // ignore $0 (new business)
        const realizedInc = prior != null ? paid - prior : null;     // $ vs last year
        const realizedPct = prior != null ? (realizedInc / prior) * 100 : null; // % vs last year
        return {
          id: r.id, customer_name: r.customer_name, policy_no: r.policy_no,
          resolution_date: r.resolution_date, rep: empName[r.closed_by_id] || null,
          offer, paid, diff,
          pct: offer > 0 ? (diff / offer) * 100 : 0,
          prior, realizedInc, realizedPct,
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

      // Realized increase per policy — only rows where we know the prior premium.
      const withPrior = rows.filter(r => r.prior != null && r.prior > 0);
      const totalPrior = withPrior.reduce((s, r) => s + r.prior, 0);
      const totalPaidWithPrior = withPrior.reduce((s, r) => s + r.paid, 0);
      const netVsPrior = totalPaidWithPrior - totalPrior;           // total premium grown vs last year
      const realized = {
        count: withPrior.length,
        totalPrior,
        netVsPrior,
        avgInc: withPrior.length ? netVsPrior / withPrior.length : 0, // avg $ increase per policy
        avgPct: totalPrior > 0 ? (netVsPrior / totalPrior) * 100 : 0, // premium-weighted % increase
        savedAvgPct: (() => {
          const g = withPrior.filter(r => !r.autoResolved);
          const p = g.reduce((s, r) => s + r.prior, 0);
          return p > 0 ? (g.reduce((s, r) => s + r.realizedInc, 0) / p) * 100 : null;
        })(),
        autoAvgPct: (() => {
          const g = withPrior.filter(r => r.autoResolved);
          const p = g.reduce((s, r) => s + r.prior, 0);
          return p > 0 ? (g.reduce((s, r) => s + r.realizedInc, 0) / p) * 100 : null;
        })(),
      };

      return {
        rows,
        count: rows.length,
        totalOffer, totalPaid, netDiff,
        avgDiff: rows.length ? netDiff / rows.length : 0,
        below, above, atOffer, autoPaid,
        realized,
      };
    },
  });
}
