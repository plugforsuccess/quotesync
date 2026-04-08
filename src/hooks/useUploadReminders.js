// src/hooks/useUploadReminders.js
// Computes upload reminder status for each report type based on
// last upload timestamps and the monthly cadence schedule.
// This is the single source of truth for reminder logic —
// future email notifications will use the same rules.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

// ── Cadence schedule ─────────────────────────────────────────────────────────
// Each entry defines when a report should be uploaded each month.
// dueStart / dueEnd = day of month (1-31)
// midMonth = true means this is a second upload in the same month

const CADENCE = [
  {
    key: 'termination',
    label: 'Termination Report',
    description: 'Prior full calendar month — closes confirmed losses',
    dueStart: 1,
    dueEnd: 5,
    midMonth: false,
    uploadOrder: 1,
  },
  {
    key: 'pending_cancel',
    label: 'Pending Cancellation Report',
    description: 'Current at-risk queue snapshot',
    dueStart: 8,
    dueEnd: 10,
    midMonth: false,
    uploadOrder: 3,
  },
  {
    key: 'cancellation_audit',
    label: 'Cancellation Audit Report',
    description: 'Advances Stage 1 → Stage 2 cases',
    dueStart: 8,
    dueEnd: 10,
    midMonth: false,
    uploadOrder: 2,
  },
  {
    key: 'renewal',
    label: 'Renewal Report',
    description: 'Upcoming renewal queue',
    dueStart: 8,
    dueEnd: 10,
    midMonth: false,
    uploadOrder: 4,
  },
  {
    key: 'pending_cancel_mid',
    label: 'Pending Cancel (Mid-Month Refresh)',
    description: 'Catches mid-month changes and new at-risk cases',
    dueStart: 20,
    dueEnd: 25,
    midMonth: true,
    uploadOrder: 5,
  },
];

function getStatus(lastUploadedAt, dueStart, dueEnd) {
  const now = new Date();
  const today = now.getDate();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const uploadedThisMonth = lastUploadedAt
    ? new Date(lastUploadedAt) >= currentMonthStart
    : false;

  if (uploadedThisMonth) return 'current';
  if (today >= dueStart && today <= dueEnd) return 'due';
  if (today > dueEnd) return 'overdue';
  return 'upcoming'; // before the window opens
}

export function useUploadReminders(agencyId) {
  return useQuery({
    queryKey: ['upload_reminders', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      // Fetch last upload timestamps for all report types in parallel
      const [
        { data: termination },
        { data: pendingCancel },
        { data: cancelAudit },
        { data: renewal },
      ] = await Promise.all([
        supabase
          .from('lapse_uploads')
          .select('created_at, report_month')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('pending_cancel_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('cancellation_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('renewal_uploads')
          .select('uploaded_at')
          .eq('agency_id', agencyId)
          .eq('committed', true)
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const lastUploads = {
        termination:       termination?.created_at || null,
        pending_cancel:    pendingCancel?.uploaded_at || null,
        cancellation_audit: cancelAudit?.uploaded_at || null,
        renewal:           renewal?.uploaded_at || null,
        pending_cancel_mid: pendingCancel?.uploaded_at || null, // same table
      };

      return CADENCE.map(item => ({
        ...item,
        lastUploadedAt: lastUploads[item.key],
        status: getStatus(lastUploads[item.key], item.dueStart, item.dueEnd),
      })).filter(item => item.status !== 'upcoming'); // only show relevant reminders
    },
    enabled: !!agencyId,
    staleTime: 60 * 60 * 1000, // 1 hour — upload cadence doesn't change intraday
    refetchOnWindowFocus: false,
  });
}
