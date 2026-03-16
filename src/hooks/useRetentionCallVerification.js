import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// For a given employee and month, cross-references 'reached' phone attempts
// against rc_call_log to verify each was a real connected call.
// Returns per-attempt verification status and a summary.

export function useRetentionCallVerification({ employeeId, agencyId, month }) {
  // month format: 'YYYY-MM' e.g. '2026-04'
  const monthStart = month ? `${month}-01` : null;
  const monthEnd   = month ? `${month}-31` : null;

  return useQuery({
    queryKey: ['retention_call_verification', employeeId, agencyId, month],
    queryFn: async () => {
      if (!employeeId || !agencyId || !month) return null;

      // 1. Get employee's auth_user_id for rc_call_log matching
      const { data: emp } = await supabase
        .from('employees')
        .select('id, auth_user_id')
        .eq('id', employeeId)
        .single();
      if (!emp?.auth_user_id) return null;

      // 2. Pull all 'reached' phone attempts by this employee this month
      const [
        { data: cancelAttempts },
        { data: renewalAttempts },
      ] = await Promise.all([
        supabase
          .from('pending_cancel_attempts')
          .select(`
            id, attempted_at, result, method,
            pending_cancel_events!inner(id, phone, customer_name, policy_no)
          `)
          .eq('employee_id', employeeId)
          .eq('result', 'reached')
          .eq('method', 'phone')
          .gte('attempted_at', `${monthStart}T00:00:00Z`)
          .lte('attempted_at', `${monthEnd}T23:59:59Z`),

        supabase
          .from('renewal_attempts')
          .select(`
            id, attempted_at, result, method,
            renewal_events!inner(id, phone, customer_name, policy_no)
          `)
          .eq('employee_id', employeeId)
          .eq('result', 'reached')
          .eq('method', 'phone')
          .gte('attempted_at', `${monthStart}T00:00:00Z`)
          .lte('attempted_at', `${monthEnd}T23:59:59Z`),
      ]);

      // 3. Collect all phone numbers to look up in rc_call_log
      const allAttempts = [
        ...(cancelAttempts || []).map(a => ({
          ...a,
          caseType: 'cancel',
          phone: a.pending_cancel_events?.phone,
          customer: a.pending_cancel_events?.customer_name,
          policy_no: a.pending_cancel_events?.policy_no,
        })),
        ...(renewalAttempts || []).map(a => ({
          ...a,
          caseType: 'renewal',
          phone: a.renewal_events?.phone,
          customer: a.renewal_events?.customer_name,
          policy_no: a.renewal_events?.policy_no,
        })),
      ].filter(a => a.phone); // skip attempts where we have no phone number

      if (allAttempts.length === 0) {
        return { attempts: [], verified: 0, unverified: 0, noPhone: 0 };
      }

      // 4. Pull RC call log for this employee this month — outbound connected calls only
      const { data: rcCalls } = await supabase
        .from('rc_call_log')
        .select('call_start_time, call_date, to_number, call_result, call_direction')
        .eq('org_id', agencyId)
        .eq('employee_user_id', emp.auth_user_id)
        .eq('call_direction', 'Outbound')
        .in('call_result', ['Connected', 'Answered'])
        .gte('call_date', monthStart)
        .lte('call_date', monthEnd);

      const calls = rcCalls || [];

      // 5. Normalize phone helper
      function normalizePhone(p) {
        return (p || '').replace(/[^0-9]/g, '');
      }

      // 6. Build lookup map: normalized_phone → array of call timestamps (UTC ms)
      //    Used for ±2hr window matching — same-date is too loose
      //    (a 9am attempt could match a 4pm call on the same day).
      const callMap = {};
      for (const c of calls) {
        const norm = normalizePhone(c.to_number);
        if (norm.length < 10) continue;
        if (!callMap[norm]) callMap[norm] = [];
        callMap[norm].push(new Date(c.call_start_time).getTime());
      }

      const WINDOW_MS = 2 * 60 * 60 * 1000; // ±2 hours in milliseconds

      // 7. Verify each attempt within the ±2hr window
      const results = allAttempts.map(a => {
        const attemptDate   = a.attempted_at.slice(0, 10); // YYYY-MM-DD (display only)
        const attemptMs     = new Date(a.attempted_at).getTime();
        const normalizedPhone = normalizePhone(a.phone);
        const matchingCalls = callMap[normalizedPhone] || [];
        const verified = normalizedPhone.length >= 10 &&
          matchingCalls.some(callMs => Math.abs(callMs - attemptMs) <= WINDOW_MS);

        return {
          attemptId:  a.id,
          caseType:   a.caseType,
          customer:   a.customer,
          policy_no:  a.policy_no,
          phone:      a.phone,
          attemptDate,
          verified,
          reason: !verified
            ? (normalizedPhone.length < 10 ? 'invalid_phone' : 'no_rc_match')
            : 'matched',
        };
      });

      // Also count attempts where we had no phone at all
      const noPhone = [
        ...(cancelAttempts || []).filter(a => !a.pending_cancel_events?.phone),
        ...(renewalAttempts || []).filter(a => !a.renewal_events?.phone),
      ].length;

      return {
        attempts:   results,
        verified:   results.filter(r => r.verified).length,
        unverified: results.filter(r => !r.verified).length,
        noPhone,
        total:      results.length + noPhone,
      };
    },
    enabled: !!employeeId && !!agencyId && !!month,
    staleTime: 5 * 60 * 1000,
  });
}
