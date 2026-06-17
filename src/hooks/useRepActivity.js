// src/hooks/useRepActivity.js
// A rep's day-by-day retention output — what they actually did each day:
// attempts logged, customers reached, cancel saves + renewal confirms with the
// premium preserved, and service tasks completed. So a principal can monitor
// "what did Tracy do this morning/today" without digging through cases.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

function dayKey(ts) {
  // Local calendar day for a timestamp or date string.
  return new Date(ts).toLocaleDateString('en-CA'); // YYYY-MM-DD, local
}

export function useRepActivity(agencyId, employeeId, days = 14) {
  return useQuery({
    queryKey: ['rep_activity', agencyId, employeeId, days],
    enabled: !!agencyId && !!employeeId,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      start.setHours(0, 0, 0, 0);
      const startIso = start.toISOString();
      const startDate = start.toISOString().slice(0, 10);

      const [
        { data: cancelAtt }, { data: renewalAtt },
        { data: cancelSaves }, { data: renewalSaves },
        { data: tasksDone },
      ] = await Promise.all([
        supabase.from('pending_cancel_attempts')
          .select('attempted_at, result, auto_logged')
          .eq('agency_id', agencyId).eq('employee_id', employeeId).gte('attempted_at', startIso),
        supabase.from('renewal_attempts')
          .select('attempted_at, result, auto_logged')
          .eq('agency_id', agencyId).eq('employee_id', employeeId).gte('attempted_at', startIso),
        supabase.from('pending_cases')
          .select('customer_name, resolution_date, premium_at_risk, saved_premium, save_reversed_at')
          .eq('agency_id', agencyId).eq('closed_by_id', employeeId).eq('status', 'saved')
          .gte('resolution_date', startDate),
        supabase.from('renewal_cases')
          .select('customer_name, resolution_date, premium, saved_premium')
          .eq('agency_id', agencyId).eq('closed_by_id', employeeId).eq('status', 'confirmed')
          .gte('resolution_date', startDate),
        supabase.from('service_tasks')
          .select('completed_at')
          .eq('agency_id', agencyId).eq('completed_by_id', employeeId).eq('status', 'done')
          .gte('completed_at', startIso),
      ]);

      // Build the ordered day list (newest first) so empty days still show.
      const dayMap = {};
      for (let i = 0; i < days; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i);
        dayMap[d.toLocaleDateString('en-CA')] = {
          date: d.toLocaleDateString('en-CA'),
          attempts: 0, reached: 0, cancelSaves: 0, renewalSaves: 0, premium: 0, tasksDone: 0,
          saves: [],
        };
      }
      const bump = (k, fn) => { const d = dayMap[k]; if (d) fn(d); };

      for (const a of [...(cancelAtt || []), ...(renewalAtt || [])]) {
        if (a.auto_logged) continue; // synthetic outcome record, not real activity
        bump(dayKey(a.attempted_at), d => { d.attempts++; if (a.result === 'reached') d.reached++; });
      }
      for (const s of cancelSaves || []) {
        if (s.save_reversed_at) continue; // reversed by Allstate — not a save
        const prem = Number(s.saved_premium ?? s.premium_at_risk ?? 0) || 0;
        bump(dayKey(s.resolution_date), d => { d.cancelSaves++; d.premium += prem;
          d.saves.push({ kind: 'cancel', name: s.customer_name, premium: prem }); });
      }
      for (const s of renewalSaves || []) {
        const prem = Number(s.saved_premium ?? s.premium ?? 0) || 0;
        bump(dayKey(s.resolution_date), d => { d.renewalSaves++; d.premium += prem;
          d.saves.push({ kind: 'renewal', name: s.customer_name, premium: prem }); });
      }
      for (const t of tasksDone || []) {
        bump(dayKey(t.completed_at), d => { d.tasksDone++; });
      }

      const series = Object.values(dayMap).sort((a, b) => b.date.localeCompare(a.date));
      const totals = series.reduce((acc, d) => ({
        attempts: acc.attempts + d.attempts, reached: acc.reached + d.reached,
        saves: acc.saves + d.cancelSaves + d.renewalSaves, premium: acc.premium + d.premium,
        tasksDone: acc.tasksDone + d.tasksDone,
      }), { attempts: 0, reached: 0, saves: 0, premium: 0, tasksDone: 0 });

      return { series, totals, days };
    },
  });
}
