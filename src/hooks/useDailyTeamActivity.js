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
        supabase.from('pending_cancel_attempts')
          .select('employee_id, result, auto_logged, note, pending_case_id, pending_cases(customer_name)')
          .eq('agency_id', agencyId).gte('attempted_at', startIso).lt('attempted_at', endIso),
        supabase.from('renewal_attempts')
          .select('employee_id, result, auto_logged, note, renewal_case_id, renewal_cases(customer_name)')
          .eq('agency_id', agencyId).gte('attempted_at', startIso).lt('attempted_at', endIso),
        supabase.from('pending_cases')
          .select('id, closed_by_id, customer_name, premium_at_risk, saved_premium, save_reversed_at')
          .eq('agency_id', agencyId).eq('status', 'saved').eq('resolution_date', dateStr),
        supabase.from('renewal_cases')
          .select('id, closed_by_id, customer_name, premium, saved_premium')
          .eq('agency_id', agencyId).eq('status', 'confirmed').eq('resolution_date', dateStr),
        supabase.from('service_tasks').select('completed_by_id, title, customer_name')
          .eq('agency_id', agencyId).eq('status', 'done').gte('completed_at', startIso).lt('completed_at', endIso),
      ]);

      const byRep = {};
      const rep = (id) => (byRep[id] ||= {
        attempts: 0, reached: 0, cancelSaves: 0, renewalSaves: 0, premium: 0, tasksDone: 0, worked: {}, tasksList: [],
      });
      const touch = (r, kind, caseId, name, result, note) => {
        const key = `${kind}:${caseId}`;
        const w = (r.worked[key] ||= { name, kind, result: null, saved: false, premium: 0, note: null });
        if (name && !w.name) w.name = name;
        if (note && note.trim()) w.note = note.trim();
        if (result === 'reached') w.result = 'reached';
        else if (!w.result) w.result = result;
        return w;
      };

      for (const a of cancelAtt || []) {
        if (a.auto_logged || !a.employee_id) continue;
        const r = rep(a.employee_id); r.attempts++; if (a.result === 'reached') r.reached++;
        touch(r, 'cancel', a.pending_case_id, a.pending_cases?.customer_name, a.result, a.note);
      }
      for (const a of renewalAtt || []) {
        if (a.auto_logged || !a.employee_id) continue;
        const r = rep(a.employee_id); r.attempts++; if (a.result === 'reached') r.reached++;
        touch(r, 'renewal', a.renewal_case_id, a.renewal_cases?.customer_name, a.result, a.note);
      }
      for (const s of cancelSaves || []) {
        if (s.save_reversed_at || !s.closed_by_id) continue;
        const prem = Number(s.saved_premium ?? s.premium_at_risk ?? 0) || 0;
        const r = rep(s.closed_by_id); r.cancelSaves++; r.premium += prem;
        const w = touch(r, 'cancel', s.id, s.customer_name, 'saved'); w.saved = true; w.premium = prem;
      }
      for (const s of renewalSaves || []) {
        if (!s.closed_by_id) continue;
        const prem = Number(s.saved_premium ?? s.premium ?? 0) || 0;
        const r = rep(s.closed_by_id); r.renewalSaves++; r.premium += prem;
        const w = touch(r, 'renewal', s.id, s.customer_name, 'saved'); w.saved = true; w.premium = prem;
      }
      for (const t of tasksDone || []) {
        if (!t.completed_by_id) continue;
        const r = rep(t.completed_by_id); r.tasksDone++;
        r.tasksList.push({ title: t.title, customer_name: t.customer_name });
      }

      for (const r of Object.values(byRep)) {
        r.worked = Object.values(r.worked).sort((a, b) => (b.saved - a.saved));
      }
      return byRep; // keyed by employee id
    },
  });
}
