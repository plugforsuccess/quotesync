// src/hooks/useDailyTeamActivity.js
// One day, the whole team — every rep's retention output for a chosen date:
// calls logged, customers reached, saves (with premium), tasks completed. The
// daily-standup view ("what did the team do today").
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useDailyTeamActivity(agencyId, dateStr) {
  return useQuery({
    queryKey: ['daily_team_activity', agencyId, dateStr],
    enabled: !!agencyId && !!dateStr,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(dateStr + 'T00:00:00');     // local midnight
      const end = new Date(start); end.setDate(start.getDate() + 1);
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const [
        { data: cancelAtt }, { data: renewalAtt },
        { data: cancelSaves }, { data: renewalSaves },
        { data: tasksDone },
      ] = await Promise.all([
        supabase.from('pending_cancel_attempts').select('employee_id, result, auto_logged')
          .eq('agency_id', agencyId).gte('attempted_at', startIso).lt('attempted_at', endIso),
        supabase.from('renewal_attempts').select('employee_id, result, auto_logged')
          .eq('agency_id', agencyId).gte('attempted_at', startIso).lt('attempted_at', endIso),
        supabase.from('pending_cases')
          .select('closed_by_id, customer_name, premium_at_risk, saved_premium, save_reversed_at')
          .eq('agency_id', agencyId).eq('status', 'saved').eq('resolution_date', dateStr),
        supabase.from('renewal_cases')
          .select('closed_by_id, customer_name, premium, saved_premium')
          .eq('agency_id', agencyId).eq('status', 'confirmed').eq('resolution_date', dateStr),
        supabase.from('service_tasks').select('completed_by_id')
          .eq('agency_id', agencyId).eq('status', 'done').gte('completed_at', startIso).lt('completed_at', endIso),
      ]);

      const byRep = {};
      const rep = (id) => (byRep[id] ||= {
        attempts: 0, reached: 0, cancelSaves: 0, renewalSaves: 0, premium: 0, tasksDone: 0, saves: [],
      });

      for (const a of [...(cancelAtt || []), ...(renewalAtt || [])]) {
        if (a.auto_logged || !a.employee_id) continue;
        const r = rep(a.employee_id); r.attempts++; if (a.result === 'reached') r.reached++;
      }
      for (const s of cancelSaves || []) {
        if (s.save_reversed_at || !s.closed_by_id) continue;
        const prem = Number(s.saved_premium ?? s.premium_at_risk ?? 0) || 0;
        const r = rep(s.closed_by_id); r.cancelSaves++; r.premium += prem;
        r.saves.push({ kind: 'cancel', name: s.customer_name, premium: prem });
      }
      for (const s of renewalSaves || []) {
        if (!s.closed_by_id) continue;
        const prem = Number(s.saved_premium ?? s.premium ?? 0) || 0;
        const r = rep(s.closed_by_id); r.renewalSaves++; r.premium += prem;
        r.saves.push({ kind: 'renewal', name: s.customer_name, premium: prem });
      }
      for (const t of tasksDone || []) {
        if (!t.completed_by_id) continue;
        rep(t.completed_by_id).tasksDone++;
      }

      return byRep; // keyed by employee id
    },
  });
}
