// src/hooks/useInterventionEffectiveness.js
// Reads intervention_effectiveness (per-tactic save counts) and turns it into
// per-tactic save rates + a learned overall save-lift. This is the moat
// dataset: "which save tactics actually work." Empty until enough captured.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useInterventionTypes } from './useInterventionTypes';
import { SAVE_LIFT_DEFAULT } from '../lib/retentionElasticity';

// Minimum resolved cases before a learned rate is trusted over the prior.
export const MIN_SAMPLE = 10;

export function useInterventionEffectiveness(agencyId) {
  const { data: types = [] } = useInterventionTypes();

  const query = useQuery({
    queryKey: ['intervention_effectiveness', agencyId],
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('intervention_effectiveness')
        .select('tactic, used, resolved, saved')
        .eq('agency_id', agencyId);
      if (error) throw error;
      return data || [];
    },
  });

  // Loss reasons and neutral "no decision" tags aren't save tactics — exclude
  // them so they don't dilute per-tactic save rates or the learned save-lift.
  const nonTactic = new Set(types.filter((t) => t.is_loss_reason || t.is_neutral).map((t) => t.code));
  const rows = (query.data || []).filter((r) => !nonTactic.has(r.tactic));
  const labelOf = (code) => types.find((t) => t.code === code)?.display_name || code;

  const tactics = rows
    .map((r) => ({
      tactic: r.tactic,
      label: labelOf(r.tactic),
      used: r.used,
      resolved: r.resolved,
      saved: r.saved,
      saveRate: r.resolved > 0 ? r.saved / r.resolved : null,
      sufficient: r.resolved >= MIN_SAMPLE,
    }))
    .sort((a, b) => (b.saveRate ?? -1) - (a.saveRate ?? -1));

  // Learned overall save-lift across all resolved touched cases.
  const totalResolved = rows.reduce((s, r) => s + (r.resolved || 0), 0);
  const totalSaved = rows.reduce((s, r) => s + (r.saved || 0), 0);
  const learnedSaveLift = totalResolved >= MIN_SAMPLE ? totalSaved / totalResolved : null;

  return {
    isLoading: query.isLoading,
    error: query.error,
    tactics,
    totalResolved,
    learnedSaveLift,                                   // null until enough data
    effectiveSaveLift: learnedSaveLift ?? SAVE_LIFT_DEFAULT,
    observed: learnedSaveLift != null,
  };
}
