// src/hooks/useUploadChecklist.js
// Computes live upload checklist for the principal sign-in modal.
// Queries all upload tables and derives due/overdue status per report.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

function toMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toLocaleDateString('en-CA');
}

function getBusinessDaysSince(fromDate) {
  const days = [];
  const start = new Date(fromDate + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cur = new Date(start);
  cur.setDate(cur.getDate() + 1); // start from day after fromDate
  while (cur <= today) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      days.push(cur.toLocaleDateString('en-CA'));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function useUploadChecklist(agencyId) {
  return useQuery({
    queryKey: ['upload_checklist', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      const today = new Date();
      const todayStr = today.toLocaleDateString('en-CA');
      const dayOfMonth = today.getDate();
      const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1)
        .toLocaleDateString('en-CA');
      const priorMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
        .toLocaleDateString('en-CA');
      const currentWeekMonday = toMonday(today);

      // Fetch all upload statuses in parallel
      const [
        callLogDays,
        queueData,
        weeklySummary,
        termination,
        cancelAudit,
        pendingCancel,
        renewal,
        crossSell,
        reviewResult,
      ] = await Promise.all([
        // Call log: which days have data this week?
        supabase
          .from('rc_call_log')
          .select('call_date')
          .eq('org_id', agencyId)
          .gte('call_date', currentWeekMonday)
          .lte('call_date', todayStr),

        // Queue: any data this week?
        supabase
          .from('rc_queue_data')
          .select('report_date')
          .eq('org_id', agencyId)
          .gte('report_date', currentWeekMonday)
          .lte('report_date', todayStr)
          .limit(1),

        // Weekly summary: uploaded for current week?
        supabase
          .from('rc_performance_data')
          .select('week_start')
          .eq('org_id', agencyId)
          .eq('week_start', currentWeekMonday)
          .limit(1),

        // Termination: uploaded for prior month?
        supabase
          .from('lapse_uploads')
          .select('created_at, report_month')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .gte('report_month', priorMonthStart)
          .lt('report_month', currentMonthStart)
          .order('created_at', { ascending: false })
          .limit(1),

        // Cancellation audit: uploaded this month?
        supabase
          .from('cancellation_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .gte('uploaded_at', currentMonthStart)
          .order('uploaded_at', { ascending: false })
          .limit(1),

        // Pending cancel: uploaded this month?
        supabase
          .from('pending_cancel_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .gte('uploaded_at', currentMonthStart)
          .order('uploaded_at', { ascending: false })
          .limit(1),

        // Renewal: uploaded this month?
        supabase
          .from('renewal_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .gte('uploaded_at', currentMonthStart)
          .order('uploaded_at', { ascending: false })
          .limit(1),

        // Cross-sell: uploaded this month?
        supabase
          .from('cross_sell_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .gte('uploaded_at', currentMonthStart)
          .order('uploaded_at', { ascending: false })
          .limit(1),

        // Management cadence: last completed by type
        // Uses cadence_events (NOT management_reviews — that table is gone).
        supabase
          .from('cadence_events')
          .select('cadence_type, conducted_at')
          .eq('agency_id', agencyId)
          .in('cadence_type', ['weekly_checkin','monthly_scorecard','quarterly_comp','annual_evaluation'])
          .order('conducted_at', { ascending: false }),
      ]);

      // ── Call log: find missing business days this week ──────────────────
      const uploadedDays = new Set(
        (callLogDays.data || []).map(r => r.call_date)
      );
      // Business days Mon → yesterday (today's calls haven't happened yet)
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekDays = getBusinessDaysSince(
        new Date(currentWeekMonday + 'T00:00:00').setDate(
          new Date(currentWeekMonday + 'T00:00:00').getDate() - 1
        )
      ).filter(d => d <= yesterday.toLocaleDateString('en-CA'));

      const missingCallLogDays = weekDays.filter(d => !uploadedDays.has(d));

      // ── Derive status per checklist item ────────────────────────────────
      const items = [];

      // 1. Daily Call Log
      const callLogDue = missingCallLogDays.length > 0;
      items.push({
        key: 'call_log',
        category: 'performance',
        label: 'Daily Call Log',
        description: callLogDue
          ? `${missingCallLogDays.length} day(s) missing this week`
          : 'All days uploaded',
        status: callLogDue ? (missingCallLogDays.length > 2 ? 'overdue' : 'due') : 'current',
        detail: callLogDue ? missingCallLogDays.join(', ') : null,
        link: '/agency/staff-performance?tab=individual',
      });

      // 2. Daily Queue Report
      const queueDue = !queueData.data?.length;
      items.push({
        key: 'queue',
        category: 'performance',
        label: 'Daily Queue Report',
        description: queueDue ? 'Not uploaded this week' : 'Uploaded this week',
        status: queueDue ? 'due' : 'current',
        detail: null,
        link: '/agency/staff-performance?tab=individual',
      });

      // 3. Weekly User Summary — only due once the week is effectively over
      // (Friday+). Earlier in the week there's nothing to summarize yet, so
      // show as 'upcoming' to avoid a false-positive on Mon/Tue/Wed/Thu.
      const weeklySummaryUploaded = !!weeklySummary.data?.length;
      const weekIsReady = dayOfWeek === 0 || dayOfWeek >= 5; // Fri, Sat, Sun
      let weeklySummaryStatus;
      let weeklySummaryDescription;
      if (weeklySummaryUploaded) {
        weeklySummaryStatus = 'current';
        weeklySummaryDescription = 'Uploaded for current week';
      } else if (weekIsReady) {
        weeklySummaryStatus = 'due';
        weeklySummaryDescription = `Not uploaded for week of ${currentWeekMonday}`;
      } else {
        weeklySummaryStatus = 'upcoming';
        weeklySummaryDescription = 'Upload Friday or later — week still in progress';
      }
      items.push({
        key: 'weekly_summary',
        category: 'performance',
        label: 'Weekly User Summary',
        description: weeklySummaryDescription,
        status: weeklySummaryStatus,
        detail: null,
        link: '/agency/staff-performance?tab=individual',
        optional: true,
      });

      // 4. Termination Report — due 1st–5th for prior month
      const terminationInWindow = dayOfMonth >= 1 && dayOfMonth <= 5;
      const terminationUploaded = !!termination.data?.length;
      const terminationDue = terminationInWindow && !terminationUploaded;
      const terminationOverdue = dayOfMonth > 5 && !terminationUploaded;
      items.push({
        key: 'termination',
        category: 'book_of_business',
        label: 'Termination Report',
        description: terminationUploaded
          ? 'Uploaded for prior month'
          : terminationDue
          ? 'Due 1st–5th of month — upload prior month'
          : terminationOverdue
          ? 'Overdue — prior month not uploaded'
          : 'Not yet due (upload 1st–5th)',
        status: terminationUploaded ? 'current' : terminationOverdue ? 'overdue' : terminationDue ? 'due' : 'upcoming',
        detail: null,
        link: '/agency/retention?tab=import',
        uploadOrder: 1,
      });

      // 5. Cancellation Audit — due 8th–10th
      const cancelAuditInWindow = dayOfMonth >= 8 && dayOfMonth <= 10;
      const cancelAuditUploaded = !!cancelAudit.data?.length;
      const cancelAuditDue = cancelAuditInWindow && !cancelAuditUploaded;
      const cancelAuditOverdue = dayOfMonth > 10 && !cancelAuditUploaded;
      items.push({
        key: 'cancellation_audit',
        category: 'book_of_business',
        label: 'Cancellation Audit Report',
        description: cancelAuditUploaded
          ? 'Uploaded this month'
          : cancelAuditDue
          ? 'Due 8th–10th — upload now'
          : cancelAuditOverdue
          ? 'Overdue — not uploaded this month'
          : 'Not yet due (upload 8th–10th)',
        status: cancelAuditUploaded ? 'current' : cancelAuditOverdue ? 'overdue' : cancelAuditDue ? 'due' : 'upcoming',
        detail: null,
        link: '/agency/retention?tab=import',
        uploadOrder: 2,
      });

      // 6. Pending Cancellation — due 8th–10th and 20th–25th
      const pendingCancelInWindow =
        (dayOfMonth >= 8 && dayOfMonth <= 10) ||
        (dayOfMonth >= 20 && dayOfMonth <= 25);
      const pendingCancelUploaded = !!pendingCancel.data?.length;
      const pendingCancelDue = pendingCancelInWindow && !pendingCancelUploaded;
      const pendingCancelOverdue = (dayOfMonth > 10 && dayOfMonth < 20 || dayOfMonth > 25) && !pendingCancelUploaded;
      items.push({
        key: 'pending_cancel',
        category: 'book_of_business',
        label: 'Pending Cancellation Report',
        description: pendingCancelUploaded
          ? 'Uploaded this month'
          : pendingCancelDue
          ? 'Due now — upload current snapshot'
          : pendingCancelOverdue
          ? 'Overdue — upload missed'
          : 'Not yet due',
        status: pendingCancelUploaded ? 'current' : pendingCancelOverdue ? 'overdue' : pendingCancelDue ? 'due' : 'upcoming',
        detail: null,
        link: '/agency/retention?tab=import',
        uploadOrder: 3,
      });

      // 7. Renewal Report — due 8th–10th
      const renewalInWindow = dayOfMonth >= 8 && dayOfMonth <= 10;
      const renewalUploaded = !!renewal.data?.length;
      const renewalDue = renewalInWindow && !renewalUploaded;
      const renewalOverdue = dayOfMonth > 10 && !renewalUploaded;
      items.push({
        key: 'renewal',
        category: 'book_of_business',
        label: 'Renewal Report',
        description: renewalUploaded
          ? 'Uploaded this month'
          : renewalDue
          ? 'Due 8th–10th — upload now'
          : renewalOverdue
          ? 'Overdue — not uploaded this month'
          : 'Not yet due (upload 8th–10th)',
        status: renewalUploaded ? 'current' : renewalOverdue ? 'overdue' : renewalDue ? 'due' : 'upcoming',
        detail: null,
        link: '/agency/retention?tab=import',
        uploadOrder: 4,
      });

      // 8. Cross-Sell Audit — due 8th–12th, monthly cadence
      const crossSellInWindow = dayOfMonth >= 8 && dayOfMonth <= 12;
      const crossSellUploaded = !!crossSell.data?.length;
      const crossSellDue = crossSellInWindow && !crossSellUploaded;
      const crossSellOverdue = dayOfMonth > 12 && !crossSellUploaded;
      items.push({
        key: 'cross_sell_audit',
        category: 'book_of_business',
        label: 'Cross-Sell Audit Report',
        description: crossSellUploaded
          ? 'Uploaded this month'
          : crossSellDue
          ? 'Due 8th–12th — upload now'
          : crossSellOverdue
          ? 'Overdue — not uploaded this month'
          : 'Not yet due (upload 8th–12th)',
        status: crossSellUploaded ? 'current' : crossSellOverdue ? 'overdue' : crossSellDue ? 'due' : 'upcoming',
        detail: null,
        link: '/agency/retention?tab=import',
        uploadOrder: 5,
      });

      // ── Management cadence items ────────────────────────────────────────
      const cadenceData = reviewResult.data || [];
      const lastByType = {};
      for (const row of cadenceData) {
        if (!lastByType[row.cadence_type]) lastByType[row.cadence_type] = row;
      }

      const CADENCE_DEFS = [
        { key: 'weekly_checkin',     label: 'Weekly Check-In',               days: 7,   icon: '📅' },
        { key: 'monthly_scorecard',  label: 'Monthly Scorecard Review',      days: 31,  icon: '📊' },
        { key: 'quarterly_comp',     label: 'Quarterly Comp & Goals',        days: 90,  icon: '💼' },
        { key: 'annual_evaluation',  label: 'Annual Performance Evaluation', days: 365, icon: '📋' },
      ];

      for (const cd of CADENCE_DEFS) {
        const last = lastByType[cd.key]?.conducted_at || null;
        const daysSince = last
          ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000)
          : null;

        let status;
        if (!last) {
          status = 'overdue';
        } else if (daysSince < cd.days * 0.8) {
          status = 'current';
        } else if (daysSince < cd.days) {
          status = 'due';
        } else {
          status = 'overdue';
        }

        items.push({
          key: cd.key,
          category: 'management',
          label: cd.icon + ' ' + cd.label,
          description: last
            ? daysSince === 0 ? 'Conducted today'
            : daysSince === 1 ? 'Conducted yesterday'
            : `Last conducted ${daysSince} days ago`
            : 'Never conducted',
          status,
          detail: null,
          link: '/agency/staff-performance',  // navigates to scorecard
          loggable: true,                     // shows "Mark as Done" in modal
        });
      }

      return items;
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });
}
