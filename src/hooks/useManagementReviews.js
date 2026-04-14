// src/hooks/useManagementReviews.js
// Fetches last completed review per type and provides a log function.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

const REVIEW_TYPES = [
  {
    key: 'weekly_checkin',
    label: 'Weekly Check-In',
    description: '5–10 min · Call metrics, retention cases, open items',
    cadenceDays: 7,
    dueDayOfWeek: 5,   // Friday
    icon: '📅',
  },
  {
    key: 'monthly_scorecard',
    label: 'Monthly Scorecard Review',
    description: '30 min · Full scorecard, VC baseline, attendance, WFH',
    cadenceDays: 31,
    dueDayOfMonth: 1,  // 1st Monday of month
    icon: '📊',
  },
  {
    key: 'quarterly_comp',
    label: 'Quarterly Comp & Goals Review',
    description: '60 min · Compensation structure, targets, contract review',
    cadenceDays: 90,
    icon: '💼',
  },
  {
    key: 'annual_evaluation',
    label: 'Annual Performance Evaluation',
    description: 'Full written evaluation · Profit sharing eligibility, contract renewal',
    cadenceDays: 365,
    icon: '📋',
  },
];

function getStatus(lastDate, cadenceDays) {
  if (!lastDate) return 'overdue'; // never conducted

  const today = new Date();
  const last = new Date(lastDate + 'T00:00:00');
  const daysSince = Math.floor((today - last) / 86400000);

  // Within cadence — current
  if (daysSince < cadenceDays * 0.8) return 'current';

  // Approaching due date
  if (daysSince < cadenceDays) return 'due';

  // Past cadence
  return 'overdue';
}

export function useManagementReviews(agencyId) {
  const queryClient = useQueryClient();

  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['management_reviews', agencyId],
    queryFn: async () => {
      if (!agencyId) return [];

      // Fetch last completed review per type
      const { data, error } = await supabase
        .from('management_reviews')
        .select('review_type, conducted_at, employee_id, notes')
        .eq('agency_id', agencyId)
        .order('conducted_at', { ascending: false });

      if (error) throw error;

      // Get most recent per type
      const lastByType = {};
      for (const row of data || []) {
        if (!lastByType[row.review_type]) {
          lastByType[row.review_type] = row;
        }
      }

      return REVIEW_TYPES.map(rt => ({
        ...rt,
        lastConductedAt: lastByType[rt.key]?.conducted_at || null,
        lastNotes: lastByType[rt.key]?.notes || null,
        status: getStatus(
          lastByType[rt.key]?.conducted_at || null,
          rt.cadenceDays
        ),
      }));
    },
    enabled: !!agencyId,
    staleTime: 5 * 60 * 1000,
  });

  async function logReview(agencyId, reviewType, employeeId, notes) {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('management_reviews')
      .insert({
        agency_id: agencyId,
        review_type: reviewType,
        employee_id: employeeId || null,
        conducted_by: user.id,
        conducted_at: new Date().toLocaleDateString('en-CA'),
        notes: notes || null,
      });

    if (!error) {
      queryClient.invalidateQueries({ queryKey: ['management_reviews', agencyId] });
      queryClient.invalidateQueries({ queryKey: ['upload_checklist', agencyId] });
    }

    return { error };
  }

  return { reviews, isLoading, logReview };
}
