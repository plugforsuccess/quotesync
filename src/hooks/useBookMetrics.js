// src/hooks/useBookMetrics.js
// Reads the ingested book-health snapshots and derives the principal-facing
// retention scoreboard. The longitudinal asset: each monthly upload stacks
// into book_snapshots, so retention can be trended over time — something a
// single downloaded spreadsheet can't do.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// 'auto_rollup' = Allstate's "Personal Voluntary Auto" summary row, which
// rolls up Standard + Non-Standard + Specialty. Excluded from totals so PIF
// and blended retention aren't double-counted.
const ROLLUP_KEYS = new Set(['auto_rollup']);

export function useBookSnapshots(agencyId) {
  return useQuery({
    queryKey: ['book_snapshots', agencyId],
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('book_snapshots')
        .select('*')
        .eq('agency_id', agencyId)
        .order('production_month', { ascending: false });
      if (error) throw error;
      const rows = data || [];
      if (rows.length === 0) return { latestMonth: null, products: [], totals: null, months: [], trend: [] };

      const months = [...new Set(rows.map((r) => r.production_month))]; // desc
      const latestMonth = months[0];
      const latest = rows.filter((r) => r.production_month === latestMonth);

      // PIF-weighted blended retention for a set of product rows (rollup excluded).
      const blendedFor = (rowsForMonth) => {
        const real = rowsForMonth.filter((r) => !ROLLUP_KEYS.has(r.product_key));
        const pif = real.reduce((s, r) => s + (r.pif_current || 0), 0);
        if (pif <= 0) return { pif: 0, retention: null, retentionPy: null };
        const wRet = real.reduce((s, r) => s + (r.pif_current || 0) * (r.policy_retention_pct || 0), 0);
        const wRetPy = real.reduce((s, r) => s + (r.pif_current || 0) * (r.retention_py_pct || 0), 0);
        return { pif, retention: wRet / pif, retentionPy: wRetPy / pif };
      };

      // Longitudinal trend — one point per uploaded month, ascending for charting.
      const trend = [...months].reverse().map((m) => {
        const b = blendedFor(rows.filter((r) => r.production_month === m));
        return { month: m, retention: b.retention, retentionPy: b.retentionPy, pif: b.pif };
      });

      // Per-product lines for the latest month (rollup row kept but flagged).
      const products = latest
        .map((r) => ({ ...r, is_rollup: ROLLUP_KEYS.has(r.product_key) }))
        .sort((a, b) => (b.pif_current || 0) - (a.pif_current || 0));

      const latestBlended = blendedFor(latest);
      const real = latest.filter((r) => !ROLLUP_KEYS.has(r.product_key));
      const pifCurrent = real.reduce((s, r) => s + (r.pif_current || 0), 0);
      const pifPye = real.reduce((s, r) => s + (r.pif_pye || 0), 0);
      const blendedRetention = latestBlended.retention;
      const blendedRetentionPy = latestBlended.retentionPy;

      return {
        latestMonth,
        months,
        trend,
        products,
        totals: {
          pifCurrent,
          pifPye,
          pifVariance: pifCurrent - pifPye,
          blendedRetention,
          blendedRetentionPy,
          retentionPointVariance:
            blendedRetention != null && blendedRetentionPy != null
              ? blendedRetention - blendedRetentionPy
              : null,
        },
      };
    },
  });
}
