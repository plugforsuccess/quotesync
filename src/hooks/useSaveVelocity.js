// src/hooks/useSaveVelocity.js
// Save velocity — saves per week (and premium saved) so a principal can watch
// the *pace* of retention, not just a lifetime rate. Buckets resolved cancel
// saves (saved/rewritten) and confirmed renewals by the week they closed
// (resolution_date), with a per-rep rollup attributed to closed_by_id.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// Monday-anchored ISO-ish week key for a 'YYYY-MM-DD' date string.
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

export function useSaveVelocity(agencyId, weeks = 8) {
  return useQuery({
    queryKey: ['save_velocity', agencyId, weeks],
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      // Window start: Monday of (weeks-1) weeks ago, inclusive.
      const now = new Date();
      const day = (now.getDay() + 6) % 7;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - day);
      thisMonday.setHours(0, 0, 0, 0);
      const start = new Date(thisMonday);
      start.setDate(thisMonday.getDate() - (weeks - 1) * 7);
      const startStr = start.toISOString().slice(0, 10);

      const [{ data: cancels }, { data: renewals }] = await Promise.all([
        supabase
          .from('pending_cases')
          .select('status, resolution_date, premium_at_risk, saved_premium, closed_by_id, save_method')
          .eq('agency_id', agencyId)
          .in('status', ['saved', 'rewritten'])
          .gte('resolution_date', startStr),
        supabase
          .from('renewal_cases')
          .select('status, resolution_date, premium, saved_premium, closed_by_id, save_method')
          .eq('agency_id', agencyId)
          .eq('status', 'confirmed')
          .gte('resolution_date', startStr),
      ]);

      // Build the ordered list of week buckets up front so empty weeks show.
      const weekKeys = [];
      for (let i = 0; i < weeks; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i * 7);
        weekKeys.push(d.toISOString().slice(0, 10));
      }
      const byWeek = Object.fromEntries(
        weekKeys.map(k => [k, { week: k, cancelSaves: 0, renewalSaves: 0, premium: 0 }])
      );
      const byRep = {};
      // Save-tactic breakdown over the window — "how did we keep them?"
      const byMethod = {};

      const add = (rows, kind) => {
        for (const r of rows || []) {
          if (!r.resolution_date) continue;
          const wk = weekStart(r.resolution_date);
          const bucket = byWeek[wk];
          const prem = kind === 'cancel'
            ? (r.saved_premium ?? r.premium_at_risk ?? 0)
            : (r.premium ?? 0);
          if (bucket) {
            bucket[kind === 'cancel' ? 'cancelSaves' : 'renewalSaves'] += 1;
            bucket.premium += Number(prem) || 0;
          }
          const method = r.save_method || 'unrecorded';
          const mb = (byMethod[method] ||= { method, count: 0, premium: 0 });
          mb.count += 1;
          mb.premium += Number(prem) || 0;
          const rep = (byRep[r.closed_by_id] ||= {
            empId: r.closed_by_id, cancelSaves: 0, renewalSaves: 0, premium: 0,
            recent: 0, prior: 0,
          });
          rep[kind === 'cancel' ? 'cancelSaves' : 'renewalSaves'] += 1;
          rep.premium += Number(prem) || 0;
          // recent = last half of the window, prior = first half (trend arrow).
          const half = weekKeys[Math.floor(weeks / 2)];
          if (wk >= half) rep.recent += 1; else rep.prior += 1;
        }
      };
      add(cancels, 'cancel');
      add(renewals, 'renewal');

      const series = weekKeys.map(k => byWeek[k]);
      const reps = Object.values(byRep).sort(
        (a, b) => (b.cancelSaves + b.renewalSaves) - (a.cancelSaves + a.renewalSaves)
      );
      const totalSaves = series.reduce((s, w) => s + w.cancelSaves + w.renewalSaves, 0);
      const totalPremium = series.reduce((s, w) => s + w.premium, 0);
      const methods = Object.values(byMethod).sort((a, b) => b.count - a.count);

      return { series, reps, methods, totalSaves, totalPremium, weeks };
    },
  });
}
