// src/hooks/useRetentionLift.js
// The proof cohort: among renewals that reached an outcome, do the ones the desk
// actually worked retain better than the ones it never touched? "Worked" = at
// least one genuine (non-auto_logged) attempt on record. Easy-pay auto-resolved
// renewals are QUARANTINED — they renewed without a human, so counting them as
// "saves" would inflate the claim. They're reported separately, never inside the
// worked-vs-untouched comparison.
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
      const [{ data: cases, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
        supabase
          .from('renewal_cases')
          .select('id, status, premium, saved_premium, premium_change_pct')
          .eq('agency_id', agencyId)
          .in('status', RESOLVED)
          .limit(5000),
        supabase
          .from('renewal_attempts')
          .select('renewal_case_id')
          .eq('agency_id', agencyId)
          .eq('auto_logged', false)
          .limit(10000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const workedIds = new Set((attempts || []).map((a) => a.renewal_case_id));
      const rows = cases || [];

      // Auto-resolved (easy-pay inferred) never enter the comparison.
      const quarantined = rows.filter((c) => c.status === 'auto_resolved');
      const compared = rows.filter((c) => c.status !== 'auto_resolved');
      const worked = compared.filter((c) => workedIds.has(c.id));
      const untouched = compared.filter((c) => !workedIds.has(c.id));

      const w = cohortStats(worked);
      const u = cohortStats(untouched);
      const liftPoints =
        w.retainRate != null && u.retainRate != null
          ? (w.retainRate - u.retainRate) * 100 : null;

      return {
        worked: w,
        untouched: u,
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
