import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

export function useRetentionMetrics(employeeId, scoreType = 'outbound') {
  return useQuery({
    queryKey: ['retention_metrics', employeeId, scoreType],
    queryFn: async () => {
      if (!employeeId) return null;

      const CANCEL_TERMINAL = ['saved','lost','auto_resolved','cancelled','requested_cancellation'];
      const RENEWAL_TERMINAL = ['confirmed','lost','auto_resolved','unreachable'];

      // For outbound (Nathan): attribute by opened_by_id
      // For inbound (Tracy): attribute by assigned_to_id for active cases
      const cancelFilter = scoreType === 'inbound'
        ? { column: 'assigned_to_id', value: employeeId }
        : { column: 'opened_by_id', value: employeeId };

      const renewalFilter = scoreType === 'inbound'
        ? { column: 'assigned_to_id', value: employeeId }
        : { column: 'opened_by_id', value: employeeId };

      const [
        { data: cancelEvents },
        { data: renewalEvents },
        { data: cancelAttempts },
        { data: renewalAttempts },
        // Inbound-only: cases Nathan opened that Tracy closed
        { data: closedByMe },
      ] = await Promise.all([
        supabase
          .from('pending_cases')
          .select('id, status, premium_at_risk, contacted_at, resolution_date, promise_date, updated_at, attempt_count, opened_by_id, closed_by_id, stage')
          .eq(cancelFilter.column, cancelFilter.value),

        supabase
          .from('renewal_cases')
          .select('id, status, premium, saved_premium, renewal_date, original_year, contacted_at, resolution_date, updated_at, attempt_count, premium_change_pct, opened_by_id, closed_by_id')
          .eq(renewalFilter.column, renewalFilter.value),

        supabase
          .from('pending_cancel_attempts')
          .select('id, pending_case_id, result, attempted_at')
          .eq('employee_id', employeeId),

        supabase
          .from('renewal_attempts')
          .select('id, renewal_case_id, result, attempted_at')
          .eq('employee_id', employeeId),

        // Inbound only: count cases closed by this employee that were opened by someone else
        scoreType === 'inbound'
          ? supabase
              .from('pending_cases')
              .select('id, status, premium_at_risk, opened_by_id')
              .eq('closed_by_id', employeeId)
              .neq('opened_by_id', employeeId)
              .in('status', ['saved'])
          : Promise.resolve({ data: [] }),
      ]);

      const allCancel   = cancelEvents   || [];
      const allRenewals = renewalEvents  || [];
      const allCancelAttempts  = cancelAttempts  || [];
      const allRenewalAttempts = renewalAttempts || [];
      const inboundClosures    = closedByMe      || [];

      const today = new Date().toISOString().slice(0, 10);

      // ── Pending Cancel Metrics ──────────────────────────────────────────
      const cancelWorkable = allCancel.filter(e => !CANCEL_TERMINAL.includes(e.status));
      const cancelSaved    = allCancel.filter(e => e.status === 'saved');
      const cancelLost     = allCancel.filter(e => ['lost','requested_cancellation','cancelled'].includes(e.status));

      const cancelCaseIdsWithAttempts = new Set(allCancelAttempts.map(a => a.pending_case_id));
      const cancelCaseIdsReached = new Set(
        allCancelAttempts.filter(a => a.result === 'reached').map(a => a.pending_case_id)
      );

      const cancelContactRate = allCancel.length > 0
        ? cancelCaseIdsWithAttempts.size / allCancel.length : null;
      const cancelReachRate = allCancel.length > 0
        ? cancelCaseIdsReached.size / allCancel.length : null;

      const premiumSaved  = cancelSaved.reduce((s, e) => s + (e.premium_at_risk || 0), 0);
      const premiumAtRisk = cancelWorkable.reduce((s, e) => s + (e.premium_at_risk || 0), 0);

      const promisesDue  = allCancel.filter(e =>
        e.promise_date && e.promise_date <= today &&
        ['promise_to_pay','saved','promise_broken'].includes(e.status)
      );
      const promisesKept = promisesDue.filter(e => e.status === 'saved');
      const promiseFollowThrough = promisesDue.length > 0
        ? promisesKept.length / promisesDue.length : null;

      const cancelResolved = cancelSaved.length + cancelLost.length;
      const cancelSaveRate = cancelResolved > 0
        ? cancelSaved.length / cancelResolved : null;

      // ── Renewal Metrics ────────────────────────────────────────────────
      const renewalWorkable   = allRenewals.filter(e => !RENEWAL_TERMINAL.includes(e.status));
      const renewalsConfirmed = allRenewals.filter(e => e.status === 'confirmed');
      const renewalsLost      = allRenewals.filter(e => ['lost','unreachable'].includes(e.status));
      const renewalsShopping  = allRenewals.filter(e => e.status === 'shopping');
      const renewalsEscalated = allRenewals.filter(e => e.status === 'escalated');

      const renewalCaseIdsWithAttempts = new Set(allRenewalAttempts.map(a => a.renewal_case_id));
      const renewalCaseIdsReached = new Set(
        allRenewalAttempts.filter(a => a.result === 'reached').map(a => a.renewal_case_id)
      );

      const renewalContactRate = allRenewals.length > 0
        ? renewalCaseIdsWithAttempts.size / allRenewals.length : null;
      const renewalReachRate = allRenewals.length > 0
        ? renewalCaseIdsReached.size / allRenewals.length : null;

      const renewalPremiumRetained = renewalsConfirmed.reduce((s, e) => s + (e.premium || 0), 0);
      // Dollars the agent took off the renewal offer on saved cases (offer −
      // final premium, only counting genuine reductions).
      const renewalPremiumReduced = renewalsConfirmed.reduce((s, e) => {
        if (e.saved_premium == null || e.premium == null) return s;
        const d = e.premium - e.saved_premium;
        return s + (d > 0 ? d : 0);
      }, 0);
      const renewalResolved = renewalsConfirmed.length + renewalsLost.length;
      const renewalRetainRate = renewalResolved > 0
        ? renewalsConfirmed.length / renewalResolved : null;

      const daysBeforeRenewalList = allRenewals
        .filter(e => renewalCaseIdsWithAttempts.has(e.id) && e.renewal_date)
        .map(e => {
          const first = allRenewalAttempts
            .filter(a => a.renewal_case_id === e.id)
            .sort((a, b) => a.attempted_at.localeCompare(b.attempted_at))[0];
          if (!first) return null;
          const d = Math.ceil((new Date(e.renewal_date) - new Date(first.attempted_at)) / 86400000);
          return d >= 0 ? d : null;
        })
        .filter(d => d !== null);

      const avgDaysBeforeRenewal = daysBeforeRenewalList.length > 0
        ? Math.round(daysBeforeRenewalList.reduce((s, d) => s + d, 0) / daysBeforeRenewalList.length)
        : null;

      return {
        scoreType,
        // Pending cancel
        cancelTotal:          allCancel.length,
        cancelWorkable:       cancelWorkable.length,
        cancelSaved:          cancelSaved.length,
        cancelLost:           cancelLost.length,
        cancelSaveRate,
        cancelContactRate,
        cancelReachRate,
        totalCancelAttempts:  allCancelAttempts.length,
        premiumSaved,
        premiumAtRisk,
        promiseFollowThrough,
        promisesDue:          promisesDue.length,
        promisesKept:         promisesKept.length,
        // Renewals
        renewalTotal:          allRenewals.length,
        renewalWorkable:       renewalWorkable.length,
        renewalsConfirmed:     renewalsConfirmed.length,
        renewalsLost:          renewalsLost.length,
        renewalsShopping:      renewalsShopping.length,
        renewalsEscalated:     renewalsEscalated.length,
        renewalRetainRate,
        renewalContactRate,
        renewalReachRate,
        totalRenewalAttempts:  allRenewalAttempts.length,
        renewalPremiumRetained,
        renewalPremiumReduced,
        avgDaysBeforeRenewal,
        // Inbound-only metrics
        inboundClosures:       inboundClosures.length,
        inboundPremiumClosed:  inboundClosures.reduce((s, e) => s + (e.premium_at_risk || 0), 0),
      };
    },
    enabled: !!employeeId,
    staleTime: 2 * 60 * 1000,
  });
}
