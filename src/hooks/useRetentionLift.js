// src/hooks/useRetentionLift.js
// The proof cohort: among renewals that reached an outcome, do the ones the desk
// proactively worked retain better than the ones it never touched? "Worked" =
// at least one genuine (non-auto_logged) OUTBOUND attempt on record — outreach
// the rep initiated. Two cohorts are pulled OUT of the comparison so the claim
// stays defensible:
//   • Easy-pay auto-resolved renewals — they renewed without a human, so they
//     can't count as saves.
//   • Inbound-only renewals — the only genuine attempts were calls the CUSTOMER
//     placed. The desk handled them, but it didn't drive the retention, so
//     crediting them to proactive outreach would overstate the lift.
// Both are reported separately, never inside the worked-vs-untouched comparison.
//
// Caveats this hook surfaces (so the UI can state them honestly): cohort sizes,
// and the average rate increase per cohort — if the worked cohort had smaller
// increases, some of the gap is selection, not skill.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const RESOLVED = ['confirmed', 'lost', 'unreachable', 'auto_resolved'];

function cohortStats(cases) {
  const confirmed = cases.filter((c) => c.status === 'confirmed');
  const lost = cases.filter((c) => c.status === 'lost' || c.status === 'unreachable');
  const resolved = confirmed.length + lost.length;
  const premiumRetained = confirmed.reduce(
    (s, c) => s + Number(c.saved_premium ?? c.premium ?? 0), 0,
  );
  const rateVals = cases.map((c) => c.premium_change_pct).filter((v) => v != null);
  const avgRateChange = rateVals.length
    ? rateVals.reduce((s, v) => s + Number(v), 0) / rateVals.length : null;
  return {
    cases: cases.length,
    confirmed: confirmed.length,
    lost: lost.length,
    resolved,
    retainRate: resolved > 0 ? confirmed.length / resolved : null,
    premiumRetained,
    avgRateChange,
  };
}

export function useRetentionLift(agencyId) {
  return useQuery({
    queryKey: ['retention_lift', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // Pull attempts with `direction` so inbound-only cases can be split out.
      // Fallback: if the column hasn't been applied yet, re-fetch without it and
      // treat every genuine attempt as outbound (prior behavior).
      const loadAttempts = async (withDir) =>
        supabase
          .from('renewal_attempts')
          .select(`renewal_case_id${withDir ? ', direction' : ''}`)
          .eq('agency_id', agencyId)
          .eq('auto_logged', false)
          .limit(10000);

      const [{ data: cases, error: e1 }, attemptsRes] = await Promise.all([
        supabase
          .from('renewal_cases')
          .select('id, status, premium, saved_premium, premium_change_pct')
          .eq('agency_id', agencyId)
          .in('status', RESOLVED)
          .limit(5000),
        loadAttempts(true),
      ]);
      if (e1) throw e1;
      let attempts = attemptsRes.data;
      if (attemptsRes.error) {
        const retry = await loadAttempts(false);
        if (retry.error) throw retry.error;
        attempts = retry.data;
      }

      // Per-case: did the desk make ANY genuine attempt, and did any of those
      // attempts go OUTbound (rep-initiated)? A case with attempts but none
      // outbound is inbound-only — the customer drove it, not the desk.
      const anyAttempt = new Set();
      const outboundAttempt = new Set();
      for (const a of attempts || []) {
        anyAttempt.add(a.renewal_case_id);
        if (a.direction !== 'inbound') outboundAttempt.add(a.renewal_case_id);
      }
      const rows = cases || [];

      // Auto-resolved (easy-pay inferred) and inbound-only never enter the
      // worked-vs-untouched comparison.
      const quarantined = rows.filter((c) => c.status === 'auto_resolved');
      const compared = rows.filter((c) => c.status !== 'auto_resolved');
      const worked = compared.filter((c) => outboundAttempt.has(c.id));
      const inboundOnly = compared.filter(
        (c) => !outboundAttempt.has(c.id) && anyAttempt.has(c.id),
      );
      const untouched = compared.filter((c) => !anyAttempt.has(c.id));

      const w = cohortStats(worked);
      const u = cohortStats(untouched);
      const inb = cohortStats(inboundOnly);
      const liftPoints =
        w.retainRate != null && u.retainRate != null
          ? (w.retainRate - u.retainRate) * 100 : null;

      return {
        worked: w,
        untouched: u,
        inboundOnly: inb,
        liftPoints,
        quarantined: {
          cases: quarantined.length,
          premium: quarantined.reduce(
            (s, c) => s + Number(c.saved_premium ?? c.premium ?? 0), 0,
          ),
        },
      };
    },
  });
}
