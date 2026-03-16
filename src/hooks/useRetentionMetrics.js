import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRetentionMetrics(employeeId) {
  return useQuery({
    queryKey: ['retention_metrics', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;

      // Run all queries in parallel
      const [
        { data: cancelEvents,   error: e1 },
        { data: renewalEvents,  error: e2 },
        { data: cancelAttempts, error: e3 },
        { data: renewalAttempts, error: e4 },
      ] = await Promise.all([
        supabase
          .from('pending_cancel_events')
          .select('id, status, premium_at_risk, contacted_at, resolution_date, promise_date, updated_at, attempt_count')
          .eq('assigned_to_id', employeeId),

        supabase
          .from('renewal_events')
          .select('id, status, premium, renewal_date, original_year, contacted_at, resolution_date, updated_at, attempt_count, premium_change_pct')
          .eq('assigned_to_id', employeeId),

        supabase
          .from('pending_cancel_attempts')
          .select('id, pending_cancel_event_id, result, attempted_at')
          .eq('employee_id', employeeId),

        supabase
          .from('renewal_attempts')
          .select('id, renewal_event_id, result, attempted_at')
          .eq('employee_id', employeeId),
      ]);

      if (e1 || e2 || e3 || e4) throw e1 || e2 || e3 || e4;

      const allCancel   = cancelEvents   || [];
      const allRenewals = renewalEvents  || [];
      const allCancelAttempts  = cancelAttempts  || [];
      const allRenewalAttempts = renewalAttempts || [];

      const today = new Date().toISOString().slice(0, 10);

      // ── Pending Cancel Metrics ──────────────────────────────────────────

      const cancelSaved  = allCancel.filter(e => e.status === 'saved');
      const cancelLost   = allCancel.filter(e => ['lost', 'requested_cancellation'].includes(e.status));

      // Contact rate from attempts — cases that have at least one attempt logged
      const cancelCaseIdsWithAttempts = new Set(allCancelAttempts.map(a => a.pending_cancel_event_id));
      const cancelContactRate = allCancel.length > 0
        ? cancelCaseIdsWithAttempts.size / allCancel.length
        : null;

      // Cases actually reached (at least one 'reached' result)
      const cancelCaseIdsReached = new Set(
        allCancelAttempts.filter(a => a.result === 'reached').map(a => a.pending_cancel_event_id)
      );
      const cancelReachRate = allCancel.length > 0
        ? cancelCaseIdsReached.size / allCancel.length
        : null;

      const premiumSaved  = cancelSaved.reduce((s, e) => s + (e.premium_at_risk || 0), 0);
      const premiumAtRisk = allCancel
        .filter(e => !['saved','lost','auto_resolved','requested_cancellation'].includes(e.status))
        .reduce((s, e) => s + (e.premium_at_risk || 0), 0);

      // Promise follow-through
      const promisesDue   = allCancel.filter(e =>
        e.promise_date && e.promise_date <= today &&
        ['promise_to_pay','saved','promise_broken'].includes(e.status)
      );
      const promisesKept  = promisesDue.filter(e => e.status === 'saved');
      const promiseFollowThrough = promisesDue.length > 0
        ? promisesKept.length / promisesDue.length
        : null;

      const cancelResolved = cancelSaved.length + cancelLost.length;
      const cancelSaveRate = cancelResolved > 0
        ? cancelSaved.length / cancelResolved
        : null;

      // Total attempts made by Tracy on cancel cases
      const totalCancelAttempts = allCancelAttempts.length;

      // ── Renewal Metrics ────────────────────────────────────────────────

      const renewalsConfirmed = allRenewals.filter(e => e.status === 'confirmed');
      const renewalsLost      = allRenewals.filter(e => ['lost','unreachable'].includes(e.status));
      const renewalsShopping  = allRenewals.filter(e => e.status === 'shopping');
      const renewalsEscalated = allRenewals.filter(e => e.status === 'escalated');

      // Contact rate from attempts
      const renewalCaseIdsWithAttempts = new Set(allRenewalAttempts.map(a => a.renewal_event_id));
      const renewalContactRate = allRenewals.length > 0
        ? renewalCaseIdsWithAttempts.size / allRenewals.length
        : null;

      // Cases actually reached
      const renewalCaseIdsReached = new Set(
        allRenewalAttempts.filter(a => a.result === 'reached').map(a => a.renewal_event_id)
      );
      const renewalReachRate = allRenewals.length > 0
        ? renewalCaseIdsReached.size / allRenewals.length
        : null;

      const renewalPremiumRetained = renewalsConfirmed.reduce((s, e) => s + (e.premium || 0), 0);
      const renewalResolved = renewalsConfirmed.length + renewalsLost.length;
      const renewalRetainRate = renewalResolved > 0
        ? renewalsConfirmed.length / renewalResolved
        : null;

      // Avg days before renewal date at FIRST contact attempt
      // Measures whether Tracy is reaching customers early enough
      const daysBeforeRenewalList = allRenewals
        .filter(e => renewalCaseIdsWithAttempts.has(e.id) && e.renewal_date)
        .map(e => {
          const firstAttempt = allRenewalAttempts
            .filter(a => a.renewal_event_id === e.id)
            .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))[0];
          if (!firstAttempt) return null;
          const renewalDate  = new Date(e.renewal_date);
          const attemptDate  = new Date(firstAttempt.attempted_at);
          return Math.ceil((renewalDate - attemptDate) / 86400000);
        })
        .filter(d => d !== null && d >= 0); // only count pre-renewal attempts

      const avgDaysBeforeRenewal = daysBeforeRenewalList.length > 0
        ? Math.round(daysBeforeRenewalList.reduce((s, d) => s + d, 0) / daysBeforeRenewalList.length)
        : null;

      // Total attempts on renewal cases
      const totalRenewalAttempts = allRenewalAttempts.length;

      return {
        // Pending cancel
        cancelTotal:          allCancel.length,
        cancelSaved:          cancelSaved.length,
        cancelLost:           cancelLost.length,
        cancelSaveRate,
        cancelContactRate,    // cases with at least one attempt / total cases
        cancelReachRate,      // cases actually reached / total cases
        totalCancelAttempts,  // raw attempt count
        premiumSaved,
        premiumAtRisk,
        promiseFollowThrough,
        promisesDue:          promisesDue.length,
        promisesKept:         promisesKept.length,

        // Renewals
        renewalTotal:          allRenewals.length,
        renewalsConfirmed:     renewalsConfirmed.length,
        renewalsLost:          renewalsLost.length,
        renewalsShopping:      renewalsShopping.length,
        renewalsEscalated:     renewalsEscalated.length,
        renewalRetainRate,
        renewalContactRate,    // cases with at least one attempt / total cases
        renewalReachRate,      // cases actually reached / total cases
        totalRenewalAttempts,  // raw attempt count
        renewalPremiumRetained,
        avgDaysBeforeRenewal,  // avg days before renewal date at first contact
      };
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });
}
