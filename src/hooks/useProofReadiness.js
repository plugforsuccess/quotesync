// src/hooks/useProofReadiness.js
// Tells you when there's enough captured data to build the per-rep, per-tactic
// save-rate view — so "when do I build it" becomes a number you watch tick up
// instead of a guess. Counts, per rep, the resolved renewals (confirmed/lost)
// that carry a genuine reached-call tactic. The grid is worth building once the
// top rep clears MIN_SAMPLE tactic-bearing resolved cases (the same bar
// useInterventionEffectiveness uses before trusting a learned rate).

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { MIN_SAMPLE } from './useInterventionEffectiveness';

const RESOLVED = ['confirmed', 'lost', 'unreachable'];
const hasTactic = (a) => Array.isArray(a.interventions) && a.interventions.length > 0;

export function useProofReadiness(agencyId) {
  return useQuery({
    queryKey: ['proof_readiness', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const [{ data: cases, error: e1 }, { data: attempts, error: e2 }] = await Promise.all([
        supabase
          .from('renewal_cases')
          .select('id, status')
          .eq('agency_id', agencyId)
          .in('status', RESOLVED)
          .limit(5000),
        supabase
          .from('renewal_attempts')
          .select('renewal_case_id, employee_id, interventions')
          .eq('agency_id', agencyId)
          .eq('result', 'reached')
          .eq('auto_logged', false)
          .limit(10000),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const resolvedIds = new Set((cases || []).map((c) => c.id));

      // Per rep: distinct resolved renewals on which they logged a tactic.
      const perRepCases = new Map(); // empId -> Set(caseId)
      for (const a of attempts || []) {
        if (!hasTactic(a) || !resolvedIds.has(a.renewal_case_id) || !a.employee_id) continue;
        if (!perRepCases.has(a.employee_id)) perRepCases.set(a.employee_id, new Set());
        perRepCases.get(a.employee_id).add(a.renewal_case_id);
      }

      const perRep = [...perRepCases.entries()]
        .map(([empId, set]) => ({ empId, count: set.size }))
        .sort((a, b) => b.count - a.count);

      const allTacticResolved = new Set();
      for (const set of perRepCases.values()) for (const id of set) allTacticResolved.add(id);

      const topRepCount = perRep[0]?.count ?? 0;

      return {
        minSample: MIN_SAMPLE,
        perRep,
        topRepCount,
        totalTacticResolved: allTacticResolved.size,
        sampleReady: topRepCount >= MIN_SAMPLE,
      };
    },
  });
}
