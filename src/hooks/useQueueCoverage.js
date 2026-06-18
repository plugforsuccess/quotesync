// src/hooks/useQueueCoverage.js
// Per-rep queue coverage for today — for each rep: how big their assigned queue
// is, how much is untouched, how many they've worked today, and progress against
// their daily call target. The principal's "how well are they attacking the
// queue right now" view.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const CANCEL_TERMINAL = '(saved,rewritten,lost,auto_resolved,cancelled,requested_cancellation)';
const RENEWAL_TERMINAL = '(confirmed,lost,auto_resolved,unreachable)';

export function useQueueCoverage(agencyId) {
  return useQuery({
    queryKey: ['queue_coverage', agencyId],
    enabled: !!agencyId,
    staleTime: 60_000,
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const todayIso = start.toISOString();
      const today = start.toISOString().slice(0, 10);
      const nowIso = new Date().toISOString();

      const [
        { data: cancels }, { data: renewals },
        { data: cancelAtt }, { data: renewalAtt },
        { data: emps },
      ] = await Promise.all([
        supabase.from('pending_cases')
          .select('assigned_to_id, attempt_count, cancel_effective_date')
          .eq('agency_id', agencyId).not('status', 'in', CANCEL_TERMINAL)
          .not('assigned_to_id', 'is', null)
          .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`),
        supabase.from('renewal_cases')
          .select('assigned_to_id, attempt_count, renewal_date')
          .eq('agency_id', agencyId).not('status', 'in', RENEWAL_TERMINAL)
          .not('assigned_to_id', 'is', null)
          .or(`snoozed_until.is.null,snoozed_until.lt.${nowIso}`),
        supabase.from('pending_cancel_attempts').select('employee_id, pending_case_id')
          .eq('agency_id', agencyId).eq('auto_logged', false).gte('attempted_at', todayIso),
        supabase.from('renewal_attempts').select('employee_id, renewal_case_id')
          .eq('agency_id', agencyId).eq('auto_logged', false).gte('attempted_at', todayIso),
        supabase.from('employees')
          .select('id, first_name, last_name, preferred_name, daily_call_target, roles')
          .eq('org_id', agencyId).eq('employment_status', 'active'),
      ]);

      const byRep = {};
      const get = (id) => (byRep[id] ||= {
        empId: id, queue: 0, untouched: 0, overdue: 0, callsToday: 0, touched: new Set(),
      });

      for (const c of cancels || []) {
        const r = get(c.assigned_to_id); r.queue++;
        const untouched = !(c.attempt_count > 0);
        if (untouched) r.untouched++;
        if (untouched && c.cancel_effective_date && c.cancel_effective_date < today) r.overdue++;
      }
      for (const c of renewals || []) {
        const r = get(c.assigned_to_id); r.queue++;
        const untouched = !(c.attempt_count > 0);
        if (untouched) r.untouched++;
        if (untouched && c.renewal_date && c.renewal_date < today) r.overdue++;
      }
      for (const a of cancelAtt || []) { if (a.employee_id) { const r = get(a.employee_id); r.callsToday++; r.touched.add(`c:${a.pending_case_id}`); } }
      for (const a of renewalAtt || []) { if (a.employee_id) { const r = get(a.employee_id); r.callsToday++; r.touched.add(`r:${a.renewal_case_id}`); } }

      const empMap = {};
      for (const e of emps || []) empMap[e.id] = e;

      // One row per rep that has a queue or did something today.
      const rows = Object.values(byRep).map(r => {
        const e = empMap[r.empId];
        return {
          empId: r.empId,
          name: e ? (e.preferred_name || `${e.first_name || ''} ${e.last_name || ''}`.trim()) : 'Unassigned',
          target: e?.daily_call_target ?? 8,
          queue: r.queue,
          untouched: r.untouched,
          overdue: r.overdue,
          callsToday: r.callsToday,
          touchedToday: r.touched.size,
        };
      }).sort((a, b) => b.queue - a.queue);

      return rows;
    },
  });
}
