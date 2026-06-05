// src/hooks/useRetentionElasticity.js
// Builds the churn model from ingested book metrics and ranks active renewal
// cases by expected saveable premium — "work these first, that's where a call
// actually moves the needle."

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useBookSnapshots } from './useBookMetrics';
import {
  buildChurnModel,
  churnProbability,
  expectedSaveablePremium,
  modelIsObserved,
  SAVE_LIFT_DEFAULT,
} from '../lib/retentionElasticity';

const RENEWAL_TERMINAL = ['confirmed', 'lost', 'auto_resolved', 'unreachable'];

export function useRetentionElasticity(agencyId) {
  const { data: book } = useBookSnapshots(agencyId);
  const model = buildChurnModel(book?.products || []);
  const observed = modelIsObserved(model);

  const casesQuery = useQuery({
    queryKey: ['elasticity_renewals', agencyId],
    enabled: !!agencyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_cases')
        .select('id, policy_no, customer_name, product, premium, premium_change_pct, original_year, renewal_date, status, assigned_to_id, attempt_count')
        .eq('agency_id', agencyId)
        .not('status', 'in', `(${RENEWAL_TERMINAL.join(',')})`)
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const cases = casesQuery.data || [];
  const ranked = cases
    .map((c) => ({
      ...c,
      churn: churnProbability(c, model),
      saveable: expectedSaveablePremium(c, model, SAVE_LIFT_DEFAULT),
    }))
    .filter((c) => c.saveable > 0)
    .sort((a, b) => b.saveable - a.saveable);

  const totalSaveable = ranked.reduce((s, c) => s + c.saveable, 0);

  return {
    isLoading: casesQuery.isLoading,
    error: casesQuery.error,
    model,
    observed,                 // true once a P&P report is ingested
    saveLift: SAVE_LIFT_DEFAULT,
    ranked,
    totalSaveable,
    asOfMonth: book?.latestMonth || null,
  };
}
