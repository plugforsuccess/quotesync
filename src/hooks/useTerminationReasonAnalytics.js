// src/hooks/useTerminationReasonAnalytics.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { queryKeys } from '../lib/queryKeys';

// lapse_events.report_month is a DATE (first of month, e.g. '2026-03-01').
// Supabase returns it as an ISO date string; normalize to 'YYYY-MM' everywhere.
const toMonthKey = (v) => (v ? String(v).slice(0, 7) : '');

/**
 * Fetch the canonical category taxonomy. Reference data — cache 1 hour.
 */
export function useTerminationCategories() {
  return useQuery({
    queryKey: queryKeys.termination.categories(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('termination_reason_categories')
        .select('id, code, display_name, description, action_class, color_token, sort_order')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });
}

/**
 * Per-month, per-category lapse summary.
 * Returns the raw lapse rows joined with category info for the window.
 *
 * @param {string} agencyId
 * @param {number} monthsBack  How many months of history (default 12)
 */
// `cutoffOverride` (a 'YYYY-MM-DD' date) takes precedence over monthsBack — used
// by the "Since SOP launch" view to bound the window to the go-live date.
export function useTrendByCategory(agencyId, monthsBack = 12, cutoffOverride = null) {
  return useQuery({
    queryKey: [...queryKeys.termination.trendByCategory(agencyId, monthsBack), cutoffOverride],
    queryFn: async () => {
      // Compute cutoff: first day of (current month - monthsBack + 1), unless an
      // explicit cutoff date is supplied. report_month is a DATE column, so the
      // bound must be a full ISO date.
      let cutoffStr;
      if (cutoffOverride) {
        cutoffStr = String(cutoffOverride).slice(0, 10);
      } else {
        const today = new Date();
        const cutoff = new Date(today.getFullYear(), today.getMonth() - monthsBack + 1, 1);
        cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-01`;
      }

      // Single join query: lapse_events + categories
      const { data, error } = await supabase
        .from('lapse_events')
        .select(`
          report_month, premium, item_count,
          termination_reason,
          termination_category_id,
          termination_reason_categories!inner(code, display_name, color_token, action_class)
        `)
        .eq('agency_id', agencyId)
        .gte('report_month', cutoffStr);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Pure transform: collapse the lapse rows into a monthly time series keyed by category.
 * @param {Array} rows From useTrendByCategory
 * @param {Array} categories From useTerminationCategories
 * @returns {Array<{ month, byCategory: { [code]: { count, premium, items } }, total: { count, premium, items } }>}
 */
export function buildMonthlySeries(rows, categories) {
  if (!Array.isArray(rows) || !Array.isArray(categories)) return [];

  // Determine the full month range from the data (normalized to 'YYYY-MM')
  const months = new Set(rows.map(r => toMonthKey(r.report_month)).filter(Boolean));
  const sortedMonths = Array.from(months).sort();

  // Initialize each month with zero values for every category
  const result = sortedMonths.map(month => {
    const byCategory = {};
    for (const cat of categories) {
      byCategory[cat.code] = { count: 0, premium: 0, items: 0 };
    }
    return { month, byCategory, total: { count: 0, premium: 0, items: 0 } };
  });
  const indexByMonth = new Map(result.map((r, i) => [r.month, i]));

  for (const row of rows) {
    const monthIdx = indexByMonth.get(toMonthKey(row.report_month));
    if (monthIdx == null) continue;

    const code = row.termination_reason_categories?.code ?? 'other';
    const entry = result[monthIdx].byCategory[code] ?? { count: 0, premium: 0, items: 0 };
    entry.count += 1;
    entry.premium += Number(row.premium || 0);
    entry.items += Number(row.item_count || 1);
    result[monthIdx].byCategory[code] = entry;

    const total = result[monthIdx].total;
    total.count += 1;
    total.premium += Number(row.premium || 0);
    total.items += Number(row.item_count || 1);
  }

  return result;
}

/**
 * Pure aggregation: collapse all months in the window into one row per category.
 * @returns {Array<{ code, display_name, color_token, action_class, count, premium, items, premiumShare, countShare }>}
 */
export function aggregateByCategory(monthlySeries, categories) {
  if (!Array.isArray(monthlySeries) || !Array.isArray(categories)) return [];

  const totals = {};
  for (const cat of categories) {
    totals[cat.code] = { count: 0, premium: 0, items: 0 };
  }

  let grandTotalPremium = 0;
  let grandTotalCount = 0;

  for (const month of monthlySeries) {
    for (const [code, v] of Object.entries(month.byCategory)) {
      if (!totals[code]) totals[code] = { count: 0, premium: 0, items: 0 };
      totals[code].count += v.count;
      totals[code].premium += v.premium;
      totals[code].items += v.items;
      grandTotalCount += v.count;
      grandTotalPremium += v.premium;
    }
  }

  return categories
    .map(cat => {
      const t = totals[cat.code] ?? { count: 0, premium: 0, items: 0 };
      return {
        code: cat.code,
        display_name: cat.display_name,
        color_token: cat.color_token,
        action_class: cat.action_class,
        count: t.count,
        premium: t.premium,
        items: t.items,
        countShare: grandTotalCount > 0 ? (t.count / grandTotalCount) * 100 : 0,
        premiumShare: grandTotalPremium > 0 ? (t.premium / grandTotalPremium) * 100 : 0,
      };
    })
    .sort((a, b) => b.premium - a.premium);
}

/**
 * Period-over-period comparison: same window length, prior period.
 * @returns {Array<{ code, ...current, priorCount, priorPremium, deltaCount, deltaPct }>}
 */
export function compareWithPrior(currentAgg, priorAgg) {
  const priorMap = new Map(priorAgg.map(p => [p.code, p]));
  return currentAgg.map(c => {
    const p = priorMap.get(c.code) ?? { count: 0, premium: 0 };
    const deltaCount = c.count - p.count;
    const deltaPct = p.count > 0 ? (deltaCount / p.count) * 100 : null;
    return {
      ...c,
      priorCount: p.count,
      priorPremium: p.premium,
      deltaCount,
      deltaPct,
    };
  });
}

/**
 * Uncategorized reasons — raw strings that mapped to 'other'.
 * Used by the alias management UI to surface what's left to categorize.
 *
 * Returns: Array<{ raw_reason, count, latest_date }>
 */
export function useUncategorizedReasons(agencyId) {
  return useQuery({
    queryKey: queryKeys.termination.uncategorized(agencyId),
    queryFn: async () => {
      // Find the 'other' category id
      const { data: cats, error: catErr } = await supabase
        .from('termination_reason_categories')
        .select('id')
        .eq('code', 'other')
        .single();
      if (catErr) throw catErr;
      const otherId = cats.id;

      // Group lapse_events by raw reason where category = 'other'
      const { data, error } = await supabase
        .from('lapse_events')
        .select('termination_reason, lapse_date')
        .eq('agency_id', agencyId)
        .eq('termination_category_id', otherId)
        .not('termination_reason', 'is', null)
        .order('lapse_date', { ascending: false });
      if (error) throw error;

      // Group client-side (Supabase doesn't support GROUP BY in client API)
      const grouped = new Map();
      for (const row of data ?? []) {
        const key = (row.termination_reason ?? '').trim();
        if (!key) continue;
        const existing = grouped.get(key) ?? { raw_reason: key, count: 0, latest_date: row.lapse_date };
        existing.count += 1;
        if (row.lapse_date > (existing.latest_date ?? '')) existing.latest_date = row.lapse_date;
        grouped.set(key, existing);
      }

      return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Alias CRUD hooks.
 */
export function useAliases(agencyId) {
  return useQuery({
    queryKey: queryKeys.termination.aliases(agencyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('termination_reason_aliases')
        .select('id, raw_reason, category_code, source, created_at')
        .eq('agency_id', agencyId)
        .order('raw_reason');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
