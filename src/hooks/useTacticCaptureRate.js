// src/hooks/useTacticCaptureRate.js
// Measures how often a genuine "reached" call records the save tactic — the moat
// field. Denominator is real dialed reached calls (auto_logged excluded, since
// those are synthetic confirm-time rows that carry their own tactic separately);
// numerator is reached calls with at least one intervention tagged. Watch this
// climb toward 100% now that the tactic is required on the reached path.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const hasTactic = (a) => Array.isArray(a.interventions) && a.interventions.length > 0;

export function useTacticCaptureRate(agencyId, recentDays = 30) {
  return useQuery({
    queryKey: ['tactic_capture_rate', agencyId, recentDays],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const sel = 'interventions, attempted_at';
      const reachedReal = (table) =>
        supabase.from(table).select(sel)
          .eq('agency_id', agencyId)
          .eq('result', 'reached')
          .eq('auto_logged', false);

      const [{ data: ren, error: e1 }, { data: can, error: e2 }] = await Promise.all([
        reachedReal('renewal_attempts'),
        reachedReal('pending_cancel_attempts'),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const all = [...(ren || []), ...(can || [])];
      const cutoff = new Date(Date.now() - recentDays * 86400000).toISOString();
      const recent = all.filter((a) => a.attempted_at && a.attempted_at >= cutoff);

      const rate = (rows) => {
        const total = rows.length;
        const withT = rows.filter(hasTactic).length;
        return { total, withTactic: withT, captureRate: total > 0 ? withT / total : null };
      };

      return { ...rate(all), recent: { days: recentDays, ...rate(recent) } };
    },
  });
}
