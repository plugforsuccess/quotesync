// src/hooks/useQueueHygiene.js
// Queue-hygiene / workflow-leak signals — the *leading* indicators that tell a
// principal the workflow is breaking BEFORE net retention drops next month.
// The sharpest one: cases that reached (or passed) their deadline with zero
// contact attempts — a policy didn't lapse because it was hard, it lapsed
// because nobody worked it in time.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const CANCEL_TERMINAL = '(saved,rewritten,lost,auto_resolved,requested_cancellation,cancelled)';
const RENEWAL_TERMINAL = '(confirmed,lost,auto_resolved,unreachable)';

function isoDay(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Monday-anchored week key for a 'YYYY-MM-DD' date string.
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function useQueueHygiene(agencyId, dueWindowDays = 7) {
  return useQuery({
    queryKey: ['queue_hygiene', agencyId, dueWindowDays],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const today = isoDay(0);
      const soon = isoDay(dueWindowDays);
      const neverWorked = 'attempt_count.is.null,attempt_count.eq.0';

      // Active (non-terminal) cancel base.
      const activeCancels = () =>
        supabase.from('pending_cases').select('id', { count: 'exact', head: true })
          .eq('agency_id', agencyId).not('status', 'in', CANCEL_TERMINAL);
      const activeRenewals = () =>
        supabase.from('renewal_cases').select('id', { count: 'exact', head: true })
          .eq('agency_id', agencyId).not('status', 'in', RENEWAL_TERMINAL);

      const [
        lapsedUnworked,      // past deadline, never called — preventable lapse
        lapsedTotal,         // past deadline, still open (win-back list)
        cancelDueUntouched,  // due within window, never called
        renewalDueUntouched, // renewal due within window, never called
        unassigned,          // active cancel with no owner
      ] = await Promise.all([
        activeCancels().lt('cancel_effective_date', today).or(neverWorked),
        activeCancels().lt('cancel_effective_date', today),
        activeCancels().gte('cancel_effective_date', today).lt('cancel_effective_date', soon).or(neverWorked),
        activeRenewals().gte('renewal_date', today).lt('renewal_date', soon).or(neverWorked),
        activeCancels().is('assigned_to_id', null),
      ]);

      const c = (r) => r.count || 0;

      // Weekly preventable-lapse trend (last 8 weeks): still-unworked lapses
      // bucketed by the week their deadline fell. The number you want trending
      // to zero. Uses current attempt_count, so it's "lapsed and still never
      // worked" — an honest floor on the leak.
      const since = isoDay(-56);
      const [lapseCancels, lapseRenewals] = await Promise.all([
        supabase.from('pending_cases').select('cancel_effective_date')
          .eq('agency_id', agencyId).not('status', 'in', CANCEL_TERMINAL)
          .lt('cancel_effective_date', today).gte('cancel_effective_date', since).or(neverWorked),
        supabase.from('renewal_cases').select('renewal_date')
          .eq('agency_id', agencyId).not('status', 'in', RENEWAL_TERMINAL)
          .lt('renewal_date', today).gte('renewal_date', since).or(neverWorked),
      ]);

      // Build 8 Monday-anchored week buckets so empty weeks still show.
      const now = new Date();
      const day = (now.getDay() + 6) % 7;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - day);
      thisMonday.setHours(0, 0, 0, 0);
      const weekKeys = [];
      for (let i = 7; i >= 0; i--) {
        const d = new Date(thisMonday);
        d.setDate(thisMonday.getDate() - i * 7);
        weekKeys.push(d.toISOString().slice(0, 10));
      }
      const trendMap = Object.fromEntries(weekKeys.map(k => [k, 0]));
      for (const r of (lapseCancels.data || [])) {
        const k = weekStart(r.cancel_effective_date); if (k in trendMap) trendMap[k]++;
      }
      for (const r of (lapseRenewals.data || [])) {
        const k = weekStart(r.renewal_date); if (k in trendMap) trendMap[k]++;
      }
      const lapseTrend = weekKeys.map(k => ({ week: k, count: trendMap[k] }));

      return {
        lapsedUnworked: c(lapsedUnworked),
        lapsedTotal: c(lapsedTotal),
        untouchedDueSoon: c(cancelDueUntouched) + c(renewalDueUntouched),
        unassignedAtRisk: c(unassigned),
        lapseTrend,
        dueWindowDays,
      };
    },
  });
}
