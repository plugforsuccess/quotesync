// src/hooks/useCancelSaveProof.js
// The cancel-side companion to useRetentionLift. Pending cancellations are the
// SOFTER half of the book: most are non-payment billing lapses, and a large
// share cure on their own (the customer just pays). So counting every saved
// cancel's full policy premium as a skilled "save" overstates the desk's
// impact far more than a renewal save does.
//
// This hook keeps the honest split at the REPORTING layer (no change to how a
// rep records a save):
//   • Cohorts, exactly like the renewal lift — proactively WORKED (>=1 genuine
//     OUTBOUND attempt), INBOUND-only (customer called us), UNTOUCHED, and
//     AUTO-CURED (cleared with no reached call — quarantined like easy-pay).
//   • A CURE BASELINE per cycle: among cancels the desk did NOT proactively
//     work, what share still cured? Repeat non-pay (higher cycle) cures far
//     less on its own, so a worked save there is worth more credit.
//   • "Rescued above baseline" premium: the worked cure rate minus the
//     cycle baseline, applied to worked saves — the desk-attributable figure a
//     carrier wouldn't laugh at.
//
// Small-sample caveat: per-cycle baselines are directional until volume grows
// (the UI states this, same as the renewal lift).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Kept in force vs genuinely gone. auto_resolved = cured without a human.
const KEPT = ['saved', 'rewritten', 'auto_resolved'];
const LOST = ['lost', 'cancelled', 'requested_cancellation'];
const RESOLVED = [...KEPT, ...LOST];

// Collapse a raw cycle number into the buckets that actually behave differently.
function cycleBucket(cycle) {
  const n = Number(cycle) || 1;
  if (n <= 1) return '1';
  if (n === 2) return '2';
  return '3+';
}
const CYCLE_ORDER = ['1', '2', '3+'];

function premOf(c) {
  return Number(c.saved_premium ?? c.premium_at_risk ?? 0);
}

// Cure rate + premium for a set of resolved cancels.
function cohortStats(cases) {
  const kept = cases.filter((c) => KEPT.includes(c.status));
  const lost = cases.filter((c) => LOST.includes(c.status));
  const resolved = kept.length + lost.length;
  return {
    cases: cases.length,
    kept: kept.length,
    lost: lost.length,
    resolved,
    cureRate: resolved > 0 ? kept.length / resolved : null,
    premiumKept: kept.reduce((s, c) => s + premOf(c), 0),
  };
}

export function useCancelSaveProof(agencyId) {
  return useQuery({
    queryKey: ['cancel_save_proof', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      // `cycle` may not be exposed on the working view everywhere; fall back to
      // treating every case as cycle 1. `direction` on attempts is handled the
      // same resilient way as the renewal lift.
      const loadCases = async (withCycle) =>
        supabase
          .from('pending_cases')
          .select(`id, status, premium_at_risk, saved_premium${withCycle ? ', cycle' : ''}`)
          .eq('agency_id', agencyId)
          .in('status', RESOLVED)
          .limit(5000);
      const loadAttempts = async (withDir) =>
        supabase
          .from('pending_cancel_attempts')
          .select(`pending_case_id${withDir ? ', direction' : ''}`)
          .eq('agency_id', agencyId)
          .eq('auto_logged', false)
          .limit(10000);

      let casesRes = await loadCases(true);
      if (casesRes.error) {
        casesRes = await loadCases(false);
        if (casesRes.error) throw casesRes.error;
      }
      let attemptsRes = await loadAttempts(true);
      if (attemptsRes.error) {
        attemptsRes = await loadAttempts(false);
        if (attemptsRes.error) throw attemptsRes.error;
      }
      const rows = casesRes.data || [];
      const attempts = attemptsRes.data || [];

      // Per-case: any genuine attempt, and any OUTBOUND genuine attempt?
      const anyAttempt = new Set();
      const outboundAttempt = new Set();
      for (const a of attempts) {
        anyAttempt.add(a.pending_case_id);
        if (a.direction !== 'inbound') outboundAttempt.add(a.pending_case_id);
      }

      // auto_resolved = cured with no human; quarantined like easy-pay renewals.
      const autoCured = rows.filter((c) => c.status === 'auto_resolved');
      const compared = rows.filter((c) => c.status !== 'auto_resolved');
      const worked = compared.filter((c) => outboundAttempt.has(c.id));
      const inboundOnly = compared.filter(
        (c) => !outboundAttempt.has(c.id) && anyAttempt.has(c.id),
      );
      // Baseline = everything NOT proactively worked (organic cure signal),
      // including auto-cured — that's exactly the "would've paid anyway" pool.
      const notWorked = rows.filter((c) => !outboundAttempt.has(c.id));

      // Per-cycle cure rates: worked vs baseline (not-worked). Lift is the gap.
      const byCycle = CYCLE_ORDER.map((bucket) => {
        const w = cohortStats(worked.filter((c) => cycleBucket(c.cycle) === bucket));
        const b = cohortStats(notWorked.filter((c) => cycleBucket(c.cycle) === bucket));
        const liftPts =
          w.cureRate != null && b.cureRate != null ? (w.cureRate - b.cureRate) * 100 : null;
        return { cycle: bucket, worked: w, baseline: b, liftPts };
      }).filter((r) => r.worked.resolved > 0 || r.baseline.resolved > 0);

      // Premium rescued above baseline: for each worked KEPT cancel, credit the
      // fraction of the save the desk actually moved — (workedRate - baseline)
      // / workedRate for that cycle. Organic-likely cures credit ~0; hard,
      // higher-cycle saves credit close to full premium.
      const rateFor = (bucket) => {
        const w = cohortStats(worked.filter((c) => cycleBucket(c.cycle) === bucket));
        const b = cohortStats(notWorked.filter((c) => cycleBucket(c.cycle) === bucket));
        return { wRate: w.cureRate, bRate: b.cureRate };
      };
      let rescuedPremium = 0;
      for (const c of worked) {
        if (!KEPT.includes(c.status)) continue;
        const { wRate, bRate } = rateFor(cycleBucket(c.cycle));
        if (!wRate || wRate <= 0) continue;
        const credit = Math.max(0, (wRate - (bRate ?? 0)) / wRate);
        rescuedPremium += premOf(c) * credit;
      }

      const workedStats = cohortStats(worked);
      return {
        worked: workedStats,
        inboundOnly: cohortStats(inboundOnly),
        baseline: cohortStats(notWorked),
        autoCured: {
          cases: autoCured.length,
          premium: autoCured.reduce((s, c) => s + premOf(c), 0),
        },
        // Gross book premium retained on worked saves (what you record today) …
        keptInForcePremium: workedStats.premiumKept,
        // … vs the slice actually attributable to the desk above organic cure.
        rescuedPremium,
        byCycle,
      };
    },
  });
}
